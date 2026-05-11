apiVersion: apps/v1
kind: Deployment
metadata:
  name: community-backend
  namespace: ${NAMESPACE}
  labels:
    app: community-backend
spec:
  replicas: ${BACKEND_REPLICAS}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: community-backend
  template:
    metadata:
      labels:
        app: community-backend
    spec:
      containers:
        - name: community-backend
          image: ${DOCKERHUB_USER}/community-backend:${IMAGE_TAG}
          imagePullPolicy: Always
          command:
            - /bin/sh
            - -c
            - mkdir -p /app/data && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
          ports:
            - containerPort: 8000
          env:
            - name: DATABASE_URL
              value: "${DATABASE_URL}"
            - name: CORS_ALLOW_ORIGINS
              value: "${CORS_ALLOW_ORIGINS}"
            - name: PYTHONUNBUFFERED
              value: "1"
          startupProbe:
            httpGet:
              path: /health
              port: 8000
            periodSeconds: 5
            failureThreshold: 24
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            periodSeconds: 5
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          volumeMounts:
            - mountPath: /app/data
              name: backend-data
      volumes:
        - name: backend-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: community-backend
  namespace: ${NAMESPACE}
  labels:
    app: community-backend
spec:
  type: ClusterIP
  selector:
    app: community-backend
  ports:
    - name: http
      port: 8000
      targetPort: 8000
