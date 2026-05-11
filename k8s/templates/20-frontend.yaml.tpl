apiVersion: apps/v1
kind: Deployment
metadata:
  name: community-frontend
  namespace: ${NAMESPACE}
  labels:
    app: community-frontend
spec:
  replicas: ${FRONTEND_REPLICAS}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: community-frontend
  template:
    metadata:
      labels:
        app: community-frontend
    spec:
      containers:
        - name: community-frontend
          image: ${DOCKERHUB_USER}/community-frontend:${IMAGE_TAG}
          imagePullPolicy: Always
          ports:
            - containerPort: 3001
          env:
            - name: PORT
              value: "3001"
            - name: API_URL
              value: "${API_URL}"
            - name: FILE_UPLOAD_API_URL
              value: "${FILE_UPLOAD_API_URL}"
            - name: NODE_ENV
              value: "production"
          startupProbe:
            httpGet:
              path: /health
              port: 3001
            periodSeconds: 5
            failureThreshold: 24
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            periodSeconds: 5
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: community-frontend
  namespace: ${NAMESPACE}
  labels:
    app: community-frontend
spec:
  type: ClusterIP
  selector:
    app: community-frontend
  ports:
    - name: http
      port: 80
      targetPort: 3001
