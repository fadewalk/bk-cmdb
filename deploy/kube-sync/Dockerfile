FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-arm64} go build -o /out/cmdb_kube_syncserver ./src/scene_server/kube_sync_server/cmd/kube-sync

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/cmdb_kube_syncserver /cmdb_kube_syncserver
USER nonroot:nonroot
EXPOSE 60014
ENTRYPOINT ["/cmdb_kube_syncserver"]
