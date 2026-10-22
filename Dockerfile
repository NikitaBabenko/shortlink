FROM golang:1.23-alpine AS builder
WORKDIR /src
RUN apk add --no-cache gcc musl-dev sqlite-dev
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=1 GOMAXPROCS=1 go test -p 1 -count=1 -timeout=90s -run '^(TestSetupAuth|TestProtect|TestPilot)' ./internal/server ./internal/setupauth ./internal/config
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/ai-shortlink ./cmd/server

FROM alpine:3.20
WORKDIR /app
ENV VIBENEST_PILOT=true SETUP_BOOTSTRAP_USER=operator COOKIE_SECURE=true
RUN apk add --no-cache ca-certificates sqlite-libs wget && addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown -R app:app /app
COPY --from=builder /out/ai-shortlink /app/ai-shortlink
USER app
EXPOSE 8080
ENTRYPOINT ["/app/ai-shortlink"]
