# Kubernetes Single-Control-Plane Lab Runbook

## 목적 | Goal
이 문서는 다음 과제를 **재현 가능한 실습 절차 + 실제 수행 기록**으로 정리한 runbook입니다.

- Rocky Linux 기반 single control-plane Kubernetes 구축
- containerd + Calico 조합 사용
- Kubernetes Dashboard / Prometheus / Grafana / Loki 설치
- FE/BE 배포 시 `startupProbe`, `livenessProbe`, `readinessProbe` 통과 확인
- 파드 강제 삭제 후 재생성 확인
- `RollingUpdate` 무중단 배포 검증
- Ubuntu 22.04 LTS로 동일 절차 재수행
- 기존 수동 설치분을 제거한 뒤 Helm 기반으로 clean reinstall

중요:
- 이 저장소는 **실습 재현용 자산과 runbook**을 제공합니다.
- 아래 절차는 2026-03-16 기준으로 실제로 수행했고, 비용 발생을 막기 위해 검증 후 AWS 런타임은 모두 삭제했습니다.
- single-node lab에서는 외부 DB 없이도 구동은 가능하지만, backend `replicas >= 2` 조건을 엄밀히 맞추려면 shared DB를 같이 두는 편이 맞습니다. 이 실습에서는 in-cluster MySQL을 사용했습니다.

## 공식 참고 문서 | Official References
- Kubernetes kubeadm install:
  - https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/
- Kubernetes containerd runtime:
  - https://kubernetes.io/docs/setup/production-environment/container-runtimes/
- Kubernetes kubeadm cluster creation:
  - https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/
- Calico quickstart:
  - https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart
- Helm install:
  - https://helm.sh/docs/intro/install/
- Kubernetes Dashboard Helm install:
  - https://github.com/kubernetes/dashboard
- kube-prometheus-stack chart:
  - https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack
- Loki stack Helm chart:
  - https://github.com/grafana/helm-charts/tree/main/charts/loki-stack

## 저장소 내 관련 자산 | Repo Assets
- App manifests:
  - `k8s/templates/10-backend.yaml.tpl`
  - `k8s/templates/20-frontend.yaml.tpl`
  - `k8s/templates/30-ingress.yaml.tpl`
- Helm values:
  - `helm/kube-prometheus-stack/values.lab.yaml`
  - `helm/loki/values.lab.yaml`
  - `helm/promtail/values.lab.yaml`

## 실행 결과 요약 | Execution Summary

### Rocky Linux 9.6
- OS: `Rocky Linux 9.6 (Blue Onyx)`
- Runtime: `containerd 1.7.28`
- CNI: `Calico v3.31.3`
- Node type actually used: `m7i-flex.large`
- Result:
  - single control-plane cluster 구축 완료
  - `Kubernetes Dashboard`, `Grafana`, `Prometheus`, `Loki`, `Promtail` 설치 완료
  - `Grafana -> Prometheus`, `Grafana -> Loki` datasource 연결 확인 완료
  - `community-frontend`, `community-backend`, `community-mysql` 배포 완료
  - `startupProbe`, `readinessProbe`, `livenessProbe` 통과 확인 완료
  - frontend pod 삭제 후 self-healing 확인 완료
  - frontend image `rocky-k8s-lab-v5-20260316` 기준 RollingUpdate 중 cluster-internal health `20/20 = 200` 확인 완료

### Ubuntu 22.04 LTS
- OS: `Ubuntu 22.04 LTS`
- Runtime: `containerd`
- CNI: `Calico`
- Result:
  - single control-plane cluster 재구축 완료
  - Dashboard / Grafana / Prometheus / Loki 설치 완료
  - 기존 설치 clean delete 후 Helm reinstall 완료

### Cost Control
- Rocky / Ubuntu 실습용 EC2는 검증 후 종료 및 삭제
- 임시 security group, key pair, port-forward only validation 경로도 정리
- Docker Hub 이미지는 포트폴리오 증빙용으로 유지, AWS 런타임 리소스는 teardown

---

## 1. Rocky Linux single control-plane 구축

### 1-1. 호스트 준비
Rocky Linux / CentOS 계열에서는 Kubernetes 공식 문서 기준으로 SELinux를 `permissive`로 두는 실습 구성이 가장 단순합니다.

실습 메모:
- Rocky 9는 AWS Marketplace 이미지와 공식 public AMI가 혼재합니다.
- 이 실습에서는 opt-in이 필요 없는 공식 public Rocky AMI를 사용했습니다.
- `t3.small`에서는 observability stack과 앱까지 동시에 올릴 때 disk pressure가 발생했습니다. 실제 검증은 `m7i-flex.large`에서 마무리했습니다.

```bash
sudo setenforce 0
sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config

sudo swapoff -a
sudo sed -ri '/\sswap\s/s/^#?/#/' /etc/fstab

cat <<'EOF' | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

cat <<'EOF' | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF

sudo sysctl --system
```

### 1-2. containerd 설치 및 설정
Kubernetes 공식 문서 기준으로 `containerd`는 CRI가 활성화되어 있어야 하고, `SystemdCgroup = true`가 권장됩니다.

Rocky 9에서는 `docker-ce` repo baseurl 이슈가 있었기 때문에, 실습에서는 `containerd` 공식 release tarball 경로가 더 안정적이었습니다.

```bash
cd /tmp
curl -fsSLO https://github.com/containerd/containerd/releases/download/v1.7.28/containerd-1.7.28-linux-amd64.tar.gz
sudo tar Cxzvf /usr/local containerd-1.7.28-linux-amd64.tar.gz
sudo mkdir -p /usr/local/lib/systemd/system
curl -fsSL https://raw.githubusercontent.com/containerd/containerd/main/containerd.service | sudo tee /usr/local/lib/systemd/system/containerd.service >/dev/null
curl -fsSLo /tmp/runc.amd64 https://github.com/opencontainers/runc/releases/download/v1.3.2/runc.amd64
sudo install -m 755 /tmp/runc.amd64 /usr/local/sbin/runc
curl -fsSLO https://github.com/containernetworking/plugins/releases/download/v1.8.0/cni-plugins-linux-amd64-v1.8.0.tgz
sudo mkdir -p /opt/cni/bin
sudo tar Cxzvf /opt/cni/bin cni-plugins-linux-amd64-v1.8.0.tgz
sudo mkdir -p /etc/containerd
sudo /usr/local/bin/containerd config default | sudo tee /etc/containerd/config.toml > /dev/null
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl daemon-reload
sudo systemctl enable --now containerd
```

### 1-3. kubeadm / kubelet / kubectl 설치
Kubernetes 1.35 기준 예시입니다. minor version을 바꾸려면 repo URL의 `v1.35` 부분을 맞춰야 합니다.

```bash
cat <<'EOF' | sudo tee /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://pkgs.k8s.io/core:/stable:/v1.35/rpm/
enabled=1
gpgcheck=1
gpgkey=https://pkgs.k8s.io/core:/stable:/v1.35/rpm/repodata/repomd.xml.key
exclude=kubelet kubeadm kubectl cri-tools kubernetes-cni
EOF

sudo yum install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
sudo systemctl enable --now kubelet
```

### 1-4. control-plane 초기화
Calico 예시 CIDR과 맞추기 위해 `192.168.0.0/16`을 사용합니다.

```bash
sudo kubeadm init --pod-network-cidr=192.168.0.0/16
```

초기화 후:

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown "$(id -u)":"$(id -g)" $HOME/.kube/config
```

### 1-5. master-only 실습을 위한 taint 제거
Kubernetes 공식 문서 기준으로 single-machine cluster에서 워크로드를 control-plane에 올리려면 taint 제거가 필요합니다.

```bash
kubectl taint nodes --all node-role.kubernetes.io/control-plane-
kubectl label nodes --all node.kubernetes.io/exclude-from-external-load-balancers-
```

### 1-6. Calico 설치
운영 환경에선 Calico operator 설치 방식이 일반적입니다. 다만 single-node lab에서는 공식 `calico.yaml` 단일 manifest 경로가 더 빠르고 단순했습니다.

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.31.3/manifests/calico.yaml
```

확인:

```bash
kubectl get nodes
kubectl get pods -n kube-system | grep calico
```

---

## 2. Helm 설치

### Rocky Linux
실습에서는 공식 install script 경로를 사용했습니다. Rocky/RHEL 계열에서 가장 일관된 방법이었습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | sudo bash
helm version
```

### Ubuntu 22.04
Helm 공식 문서 예시:

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
helm version
```

---

## 3. Dashboard / Prometheus / Grafana / Loki 설치

### 3-1. Helm repo 등록
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server
helm repo add kong https://charts.konghq.com
helm repo update
```

### 3-2. Kubernetes Dashboard 설치
실습 시점에는 chart index 경로 이슈가 있어서, 공식 source archive에서 chart를 받아 설치하는 방식이 가장 안정적이었습니다.

```bash
curl -fsSL -o /tmp/k8s-dashboard.tar.gz https://github.com/kubernetes/dashboard/archive/refs/tags/kubernetes-dashboard-7.14.0.tar.gz
mkdir -p /tmp/kubernetes-dashboard-src
tar -xzf /tmp/k8s-dashboard.tar.gz -C /tmp/kubernetes-dashboard-src --strip-components=1
helm dependency build /tmp/kubernetes-dashboard-src/charts/kubernetes-dashboard
helm upgrade --install kubernetes-dashboard /tmp/kubernetes-dashboard-src/charts/kubernetes-dashboard \
  --namespace kubernetes-dashboard \
  --create-namespace
```

접속은 실습용으로 port-forward가 가장 단순합니다.

```bash
kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard-kong-proxy 8443:443
```

### 3-3. Dashboard admin 계정
```bash
kubectl create namespace dashboard-admin

cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dashboard-admin
  namespace: dashboard-admin
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dashboard-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: dashboard-admin
    namespace: dashboard-admin
EOF

kubectl -n dashboard-admin create token dashboard-admin
```

### 3-4. kube-prometheus-stack 설치
Grafana와 Prometheus는 `kube-prometheus-stack`으로 같이 설치합니다.

```bash
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f helm/kube-prometheus-stack/values.lab.yaml
```

### 3-5. Loki 설치
실제 검증에서는 `grafana/loki`보다 `grafana/loki-stack`이 single-node lab에 더 안정적이었습니다. 이 chart가 `loki + promtail`을 한 번에 포함합니다.

```bash
helm upgrade --install loki-stack grafana/loki-stack \
  --namespace loki \
  --create-namespace \
  -f helm/loki/values.lab.yaml
```

### 3-6. Promtail 설치
`loki-stack` chart가 이미 promtail을 포함하므로, 이 실습에서는 별도 Helm release를 추가로 올리지 않았습니다.

### 3-7. Grafana에 Prometheus / Loki datasource 연결 확인
`kube-prometheus-stack`은 Grafana와 Prometheus를 같이 띄웁니다. 이 저장소의 values는 Grafana에 Loki datasource를 추가합니다.

Grafana 접속:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

Prometheus 접속:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
```

확인 포인트:
- Grafana -> Connections -> Data sources
- `Prometheus` 존재
- `Loki` 존재
- Grafana API에서 다음이 실제로 응답하는지
  - `kube_deployment_status_replicas_available{deployment="community-frontend",namespace="community"}`
  - `GET /loki/api/v1/labels`

---

## 4. FE / BE를 Kubernetes에 배포

### 4-1. 이미지 준비
과제용 새 버전 이미지를 만들려면 Docker Hub 태그를 먼저 준비합니다.

```bash
docker build -t <dockerhub-user>/community-frontend:<tag> .
docker build -t <dockerhub-user>/community-backend:<tag> ../2-sungjin-community-be
docker push <dockerhub-user>/community-frontend:<tag>
docker push <dockerhub-user>/community-backend:<tag>
```

### 4-2. 매니페스트 렌더링 및 적용
현재 템플릿은 다음 조건을 반영합니다.

- `startupProbe`
- `readinessProbe`
- `livenessProbe`
- `RollingUpdate`
- FE / BE 기본 replicas 2

주의:
- 현재 템플릿의 기본 예시는 `DATABASE_URL=<real-db-url>`입니다.
- backend를 `sqlite:///./data/community.db`로 띄우면 single-pod lab은 가능하지만, replica를 2 이상으로 늘렸을 때 각 파드가 서로 다른 로컬 DB를 사용하게 됩니다.
- 실제 검증에서는 `community-mysql`을 cluster 내부에 같이 배포해 backend replicas 2 조건을 맞췄습니다.

예시:

```bash
export NAMESPACE=community
export DOCKERHUB_USER=<dockerhub-user>
export IMAGE_TAG=<tag>
export API_URL=/api
export FILE_UPLOAD_API_URL=
export DATABASE_URL=<real-db-url>
export CORS_ALLOW_ORIGINS=http://<your-ingress-host>
export INGRESS_CLASS_NAME=nginx
export BACKEND_REPLICAS=2
export FRONTEND_REPLICAS=2

mkdir -p k8s/rendered
for template in k8s/templates/*.yaml.tpl; do
  envsubst < "$template" > "k8s/rendered/$(basename "${template%.tpl}")"
done

kubectl apply -f k8s/rendered
kubectl rollout status deployment/community-backend -n "$NAMESPACE"
kubectl rollout status deployment/community-frontend -n "$NAMESPACE"
```

### 4-3. Probe 확인
```bash
kubectl describe deploy community-backend -n "$NAMESPACE"
kubectl describe deploy community-frontend -n "$NAMESPACE"
kubectl get pods -n "$NAMESPACE"
```

확인 포인트:
- `StartupProbe` 통과 후 `Running`
- `ReadinessProbe`가 `True`
- `LivenessProbe` 실패 없이 안정 유지

---

## 5. 파드 삭제 후 self-healing 확인

```bash
kubectl get pods -n "$NAMESPACE"
kubectl delete pod <frontend-or-backend-pod-name> -n "$NAMESPACE"
kubectl get pods -n "$NAMESPACE" -w
```

확인 포인트:
- Dashboard에서 새 pod가 생성되는지
- Grafana에서 restart / replica / pod count 변화를 확인할 수 있는지

추천 Grafana 관찰 대상:
- Kubernetes / Compute Resources / Namespace (Pods)
- Kubernetes / Compute Resources / Pod
- `kube_deployment_status_replicas_available`

---

## 6. RollingUpdate 무중단 배포 테스트

새 이미지 태그 배포:

```bash
kubectl set image deployment/community-frontend \
  community-frontend=<dockerhub-user>/community-frontend:<new-tag> \
  -n "$NAMESPACE"

kubectl rollout status deployment/community-frontend -n "$NAMESPACE"
kubectl get rs -n "$NAMESPACE"
kubectl get pods -n "$NAMESPACE" -w
```

백엔드도 동일:

```bash
kubectl set image deployment/community-backend \
  community-backend=<dockerhub-user>/community-backend:<new-tag> \
  -n "$NAMESPACE"
kubectl rollout status deployment/community-backend -n "$NAMESPACE"
```

이 저장소의 Deployment 템플릿은 다음 전략을 사용합니다.

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

즉 readiness 통과 전에는 기존 pod를 다 내리지 않도록 구성되어 있습니다.

실습 메모:
- 외부 `NodePort` 경로는 single-node control-plane lab에서 순간적인 네트워크 흔들림이 있을 수 있었습니다.
- 최종 무중단 증빙은 `cluster-internal service health loop`로 남겼고, frontend `v5` rollout 동안 `20/20 = HTTP 200`을 확인했습니다.

---

## 7. Ubuntu 22.04 LTS로 재구축

차이점은 주로 package install 부분입니다.

### Ubuntu 22.04 kubeadm / kubelet / kubectl
```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg
sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.35/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.35/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
sudo systemctl enable --now kubelet
```

나머지 흐름은 Rocky와 동일합니다.
- swap off
- kernel module / sysctl
- containerd
- kubeadm init
- control-plane taint 제거
- Calico 설치
- Helm 설치
- Dashboard / Monitoring / Loki 설치
- 앱 배포 / probe / rollout 검증

---

## 8. 기존 설치 삭제 후 Helm으로 clean reinstall

### 8-1. Helm release 제거
```bash
helm uninstall kubernetes-dashboard -n kubernetes-dashboard
helm uninstall kube-prometheus-stack -n monitoring
helm uninstall loki-stack -n loki
```

### 8-2. Namespace 정리
```bash
kubectl delete namespace kubernetes-dashboard monitoring loki dashboard-admin
```

### 8-3. kube-prometheus-stack CRD 정리
공식 chart 문서 기준으로 CRD는 기본적으로 자동 삭제되지 않습니다.

```bash
kubectl delete crd alertmanagerconfigs.monitoring.coreos.com
kubectl delete crd alertmanagers.monitoring.coreos.com
kubectl delete crd podmonitors.monitoring.coreos.com
kubectl delete crd probes.monitoring.coreos.com
kubectl delete crd prometheusagents.monitoring.coreos.com
kubectl delete crd prometheuses.monitoring.coreos.com
kubectl delete crd prometheusrules.monitoring.coreos.com
kubectl delete crd scrapeconfigs.monitoring.coreos.com
kubectl delete crd servicemonitors.monitoring.coreos.com
kubectl delete crd thanosrulers.monitoring.coreos.com
```

### 8-4. 잔여 RBAC / ServiceAccount 확인
```bash
kubectl get clusterrole,clusterrolebinding | egrep 'dashboard|prometheus|grafana|loki|promtail'
kubectl get sa -A | egrep 'dashboard|prometheus|grafana|loki|promtail'
```

잔여물이 있으면 명시적으로 삭제합니다.

### 8-5. Helm으로 재설치
위의 `3번` 절차를 다시 수행합니다.

---

## 제출 체크리스트 | Submission Checklist
- [x] Rocky Linux + containerd + Calico + kubeadm single control-plane 구축 완료
- [x] control-plane taint 제거 후 master-only 운영 확인
- [x] Kubernetes Dashboard 설치 및 로그인 확인
- [x] kube-prometheus-stack 설치 후 Grafana/Prometheus 접근 확인
- [x] Loki + Promtail 설치 후 로그 수집 확인
- [x] Grafana에서 Prometheus / Loki datasource 확인
- [x] FE/BE Deployment에 startup/readiness/liveness probe 적용 확인
- [x] replicas 2 이상으로 파드 재생성 확인
- [x] RollingUpdate로 새 이미지 무중단 배포 확인
- [x] Ubuntu 22.04에서 재실습
- [x] 기존 설치 clean delete 후 Helm reinstall 재실습

## 현재 저장소 기준 남는 수동 작업 | What still requires live infrastructure
- 이 runbook은 2026-03-16 기준으로 한 차례 실제 수행을 마쳤습니다.
- 같은 실습을 다시 하려면 새 Rocky / Ubuntu 호스트가 필요합니다.
- 비용 절감을 위해 현재 AWS 런타임은 모두 teardown 된 상태입니다.
