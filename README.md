# Community Frontend Portfolio | 아무 말 대잔치 Frontend

## 프로젝트 개요 | Project Overview
`2-sungjin-community-fe`는 **Vanilla JavaScript + Express** 기반의 community web client입니다.
이 저장소는 단순 UI 구현이 아니라, 실제 서비스 관점에서 필요한 **client-side routing, form validation, API integration, deployment automation, infra handoff**까지 포함한 frontend delivery repository입니다.

This repository was built as a portfolio-grade submission for an academy project. The goal was not only to ship screens, but to prove end-to-end ownership across **application delivery, UI/UX refinement, Dockerization, CI/CD, EC2/ECS deployment, and Kubernetes validation**.

- Frontend Repo: `https://github.com/sungjin9288/2-sungjin-community-fe`
- Backend Repo: `https://github.com/sungjin9288/2-sungjin-community-be`
- Runtime note: AWS runtime resources were **validated and then torn down on 2026-03-16** to avoid ongoing cost. Code, IaC, workflow assets, and deployment evidence remain in the repository.

## 담당 범위 | Responsibility Scope
This frontend repository covers the following responsibilities:

| Area | Scope |
| --- | --- |
| Web Client | Authentication UI, posts feed, post detail/write/edit, comments, profile management, 1:1 direct message UX, shared header/navigation, theme-aware interaction |
| Frontend Server | Express-based static serving, runtime config injection, health endpoint |
| Quality | Unit tests, API smoke tests, upload path verification |
| Delivery | Docker image build, Docker Hub push, EC2 compose deployment, ECS image delivery, Kubernetes manifest rendering |
| Operations | GitHub Actions workflows, environment-driven deployment branching, blue/green rollout support |

## 핵심 성과 | Key Outcomes
- Implemented a **framework-free frontend** with Vanilla JS while keeping production-style modularization.
- Added **server-side config injection** via `config.js` so the same frontend artifact can target different environments without rebuild-time hardcoding.
- Implemented **health endpoint** (`/health`) for load balancer, blue/green, and smoke validation use cases.
- Refactored repeated page chrome into a **shared header component** and stabilized view-to-script contracts with markup smoke tests.
- Added **UI polish and resilience improvements** such as password visibility toggles, auto-resizing textareas, skeleton loading states, empty-state rendering, and theme switching.
- Added **PWA baseline assets** (`manifest.json`, `sw.js`) so the frontend can evolve toward installable/mobile-friendly delivery.
- Automated FE image delivery to **Docker Hub** and **Amazon ECR**.
- Verified deployment flows across:
  - `Docker Compose on EC2`
  - `GitHub Actions -> EC2`
  - `GitHub Actions -> ECS`
  - `GitHub Actions -> Kubernetes (staging validation)`
  - `Frontend Blue/Green on EC2`
- Executed a **kubeadm single-control-plane lab twice**:
  - `Rocky Linux 9.6 + containerd + Calico`
  - `Ubuntu 22.04 LTS + containerd + Calico`
- Installed and validated:
  - `Kubernetes Dashboard`
  - `Grafana`
  - `Prometheus`
  - `Loki / Promtail`
- Verified Grafana datasource wiring with actual responses from:
  - `Prometheus metric query`
  - `Loki labels API`
- Verified Kubernetes behavior with:
  - FE/BE/MySQL deployment
  - `startupProbe`, `readinessProbe`, `livenessProbe`
  - pod self-healing after manual deletion
  - `RollingUpdate` using new image tags with cluster-internal health loop continuity
- Fixed a real production issue around the signup flow so helper state and error state no longer conflict on the same screen.

## 기술 스택 | Tech Stack

### Application
- `JavaScript (ES6+)`
- `HTML5`
- `CSS3`
- `Express 4`
- `Node.js >= 18`

### Testing / Validation
- `node --test`
- `verify_api.js`
- `verify_upload_gateway.js`
- markup/view smoke assertions for runtime DOM contracts

### Delivery / Infra
- `Docker / Docker Compose`
- `GitHub Actions`
- `AWS EC2`
- `AWS ECS Fargate`
- `AWS EKS (staging validation)`
- `Nginx reverse proxy`
- `kubeadm single-control-plane on Rocky Linux / Ubuntu`
- `Helm-based observability stack`

## 시스템 동작 방식 | Runtime Architecture

### Frontend request flow
1. Browser requests the Express frontend server.
2. Express serves static assets from `public/`.
3. The browser loads `/config.js` to receive runtime config.
4. Client modules call backend APIs through `window.ENV_CONFIG.API_URL`.
5. Optional file uploads are routed through `FILE_UPLOAD_API_URL`.

### 왜 Express를 같이 두었는가 | Why Express exists in a frontend repo
This project intentionally keeps a lightweight Node/Express layer so the frontend can:

- inject environment-specific config at runtime
- expose `/health` for deployment checks
- serve static assets consistently in EC2 / ECS / Kubernetes environments
- avoid rebuilding the entire frontend for every environment change

## 주요 기능 | Functional Scope

### Authentication / 인증
- signup, login, logout
- email duplication check
- password policy validation
- post-signup profile image sync flow
- recovery handling when profile sync fails after account creation

### Community / 커뮤니티
- posts list with pagination
- post detail, write, edit, delete
- comments CRUD
- 1:1 direct message list, thread, and send flow
- likes toggle
- mypage, nickname/password update, account deletion

### UX / Validation
- immediate field-level validation
- toast and modal feedback instead of native alert
- upload preview and client-side image validation
- resilient signup helper state management
- password visibility toggle and accessible form interaction
- auto-resize textarea, skeleton loading, and empty-state components
- shared header injection and delegated navigation handling
- markdown-friendly post authoring / rendering flow

## 프로젝트 구조 | Repository Structure

```text
2-sungjin-community-fe/
├── public/
│   ├── css/                     # page-specific and shared styles
│   ├── js/
│   │   ├── auth/                # login/signup flows
│   │   ├── header.js            # shared header renderer
│   │   ├── posts/               # feed, detail, write/edit
│   │   ├── api.js               # API client wrapper
│   │   └── utils.js             # shared client utilities
│   └── images/
├── routes/                      # Express route handlers
├── views/                       # static HTML views
├── tests/                       # node --test suites + markup smoke coverage
├── scripts/                     # deployment helpers
├── ecs/taskdefs/                # ECS bootstrap task definitions
├── k8s/templates/               # Kubernetes manifest templates
├── docs/                        # runbooks, reports, checklists
├── docker-compose.yml
├── docker-compose.deploy.yml
├── docker-compose.reverse-proxy.yml
├── docker-compose.reverse-proxy.deploy.yml
├── server.js
└── README.md
```

## 로컬 실행 | Local Development

### Prerequisites
- `Node.js 18+`
- backend server running on `http://localhost:8000` or a custom `API_URL`

### Install
```bash
git clone https://github.com/sungjin9288/2-sungjin-community-fe.git
cd 2-sungjin-community-fe
npm install
```

### Environment
Create `.env` in the repository root.

```env
PORT=3001
API_URL=http://localhost:8000
FILE_UPLOAD_API_URL=
NODE_ENV=development
```

### Run
```bash
npm run dev
```

Production-style local run:
```bash
npm start
```

Open:
- `http://localhost:3001`

## 테스트 / 검증 | Test & Verification

### Unit tests
```bash
npm test
```

Current local baseline:
- `30/30 passed`
- includes utility tests, message UI tests, signup helper tests, and markup contract smoke tests

### API integration smoke test
```bash
npm run test:integration
```

### Upload path verification
```bash
FILE_UPLOAD_API_URL=https://{api-id}.execute-api.{region}.amazonaws.com npm run test:upload
```

### Health check
```bash
curl -s http://localhost:3001/health
```

## 배포 자산 | Delivery Assets

### Containerization
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `docker-compose.deploy.yml`
- `docker-compose.reverse-proxy.yml`
- `docker-compose.reverse-proxy.deploy.yml`

### CI/CD Workflows
- `.github/workflows/ci-frontend.yml`
- `.github/workflows/ci-cd-ec2-compose.yml`
- `.github/workflows/deploy-fe-blue-green.yml`
- `.github/workflows/ci-cd-ecs.yml`
- `.github/workflows/deploy-k8s-fe-be.yml`
- `.github/workflows/deploy-ec2-compose-self-hosted.yml`

### Deployment Helpers
- `scripts/docker-push.sh`
- `scripts/ec2-compose-deploy.sh`
- `scripts/ec2-bluegreen-fe-deploy.sh`
- `docs/github-actions-cli-runbook.md`
- `docs/deployment-execution-checklist.md`

## 인프라 수행 범위 | Infrastructure Coverage

This frontend repository participated in validating the following delivery targets together with the backend repository:

| Target | Status | Notes |
| --- | --- | --- |
| FE/BE Docker image build | Done | Docker Hub + ECR workflows implemented |
| Docker Compose on single EC2 | Done | FE/BE compose deployment validated |
| Nginx reverse proxy + MySQL compose topology | Done | Deployment assets documented |
| Portainer private registry | Done | Authenticated registry stack + Portainer HTTPS proxy assets included |
| GitHub Actions -> EC2 | Done | staging / production branching applied |
| GitHub Actions -> ECS | Done | task-definition-driven deployment validated |
| GitHub Actions -> Kubernetes | Done (staging validation) | EKS staging deploy verified, then torn down |
| Frontend Blue/Green deployment | Done | EC2-based blue/green workflow validated |
| Dedicated self-hosted runner host | Done (bootstrap assets) | Separate EC2 runner Terraform/userdata assets included |
| Rocky Linux kubeadm lab | Done | `containerd + Calico + Dashboard + Grafana/Prometheus/Loki + FE/BE probes` validated |
| Ubuntu 22.04 kubeadm lab | Done | Same lab rebuilt, clean uninstall performed, Helm reinstall re-validated |

## Portfolio Evidence | 포트폴리오 관점의 Evidence
This repository is suitable for portfolio review because it demonstrates:

- client implementation without heavy frontend frameworks
- iterative UI/UX refinement with runtime-safe refactoring
- environment-aware frontend delivery
- CI/CD ownership beyond local development
- deployment troubleshooting in real AWS environments
- operational decision-making, including teardown for cost control

### Cost Control / 비용 최적화
Because this project is a portfolio artifact rather than a commercial service, AWS runtime resources were intentionally deleted after validation. The repository still preserves:

- GitHub Actions workflows
- ECS task definitions
- Kubernetes templates
- Docker Compose deployment assets
- runbooks and reliability documentation

### Kubernetes Lab Evidence / Kubernetes 실습 증빙
The kubeadm-based lab was executed and verified on `2026-03-16`.

- Rocky Linux 9.6:
  - `containerd 1.7.28`
  - `Calico v3.31.3`
  - `Kubernetes Dashboard` HTTP 200 response verified
  - `Grafana` health verified
  - `Grafana -> Prometheus` query returned `community-frontend replicas = 3`
  - `Grafana -> Loki` labels API returned log labels successfully
  - `community-frontend`, `community-backend`, `community-mysql` deployed with probes
  - frontend pod deletion recreated a new pod automatically
  - frontend `RollingUpdate` using `rocky-k8s-lab-v5-20260316` kept cluster-internal health at `20/20 = 200`

- Ubuntu 22.04:
  - same single-control-plane topology rebuilt
  - monitoring stack removed cleanly
  - Dashboard / Prometheus / Grafana / Loki were reinstalled with Helm and re-verified

Detailed replay steps and execution notes:
- [k8s-single-control-plane-lab-runbook.md](docs/k8s-single-control-plane-lab-runbook.md)

To prevent accidental re-provisioning, AWS deployment workflows in this repository are currently kept as `workflow_dispatch` only.

## 관련 문서 | Related Documents
- [community-infra-reliability-report.md](docs/community-infra-reliability-report.md)
- [deployment-execution-checklist.md](docs/deployment-execution-checklist.md)
- [github-actions-cli-runbook.md](docs/github-actions-cli-runbook.md)
- [docker-miniquest-runbook.md](docs/docker-miniquest-runbook.md)
- [aws-bigbang-owner-runbook.md](docs/aws-bigbang-owner-runbook.md)

## Related Backend Repository
Backend implementation details live in:
- `../2-sungjin-community-be`
- `https://github.com/sungjin9288/2-sungjin-community-be`

## License
This project is released under the `MIT` License unless stated otherwise.
