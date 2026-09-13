package kube_sync_server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type cmdbClient struct {
	baseURL  string
	apiKey   string
	user     string
	supplier string
	appCode  string
	http     *http.Client
}

func newCMDBClient(c Config) *cmdbClient {
	return &cmdbClient{
		baseURL: strings.TrimRight(c.CMDBBaseURL, "/"), apiKey: c.CMDBAPIKey,
		user: c.CMDBUser, supplier: c.CMDBSupplier, appCode: c.CMDBAppCode,
		http: &http.Client{Timeout: c.HTTPTimeout},
	}
}

func (c *cmdbClient) request(ctx context.Context, method, path string, body interface{}, out interface{}) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+"/api/v3/"+strings.TrimPrefix(path, "/"), strings.NewReader(string(payload)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("X-Bkcmdb-User", c.user)
	req.Header.Set("X-Bkcmdb-Supplier-Account", c.supplier)
	req.Header.Set("X-Bkcmdb-App-Code", c.appCode)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var envelope struct {
		Result  bool            `json:"result"`
		Code    int             `json:"bk_error_code"`
		Message string          `json:"bk_error_msg"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return err
	}
	if resp.StatusCode >= 300 || !envelope.Result {
		return fmt.Errorf("cmdb %s failed: status=%d code=%d message=%s", path, resp.StatusCode, envelope.Code, envelope.Message)
	}
	if out != nil && len(envelope.Data) > 0 && string(envelope.Data) != "null" {
		return json.Unmarshal(envelope.Data, out)
	}
	return nil
}

func (c *cmdbClient) post(ctx context.Context, path string, body interface{}, out interface{}) error {
	return c.request(ctx, http.MethodPost, path, body, out)
}

func (c *cmdbClient) deletePod(ctx context.Context, cfg Config, podID int64) error {
	return c.request(ctx, http.MethodDelete, "deletemany/kube/pod", map[string]interface{}{"data": []interface{}{map[string]interface{}{"bk_biz_id": cfg.BizID, "ids": []int64{podID}}}}, nil)
}

func (c *cmdbClient) find(ctx context.Context, path string, bizID int64, filter interface{}, fields []string, out interface{}) error {
	return c.post(ctx, path, map[string]interface{}{
		"bk_biz_id": bizID,
		"filter":    filter,
		"fields":    fields,
		"page":      map[string]interface{}{"start": 0, "limit": 500, "sort": "id", "enable_count": false},
	}, out)
}

type queryRule struct {
	Field    string      `json:"field"`
	Operator string      `json:"operator"`
	Value    interface{} `json:"value"`
}
type queryFilter struct {
	Condition string      `json:"condition"`
	Rules     []queryRule `json:"rules"`
}

type cmdbCluster struct {
	ID    int64  `json:"id"`
	UID   string `json:"uid"`
	BizID int64  `json:"bk_biz_id"`
}
type cmdbNamespace struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	ClusterID int64             `json:"bk_cluster_id"`
	Labels    map[string]string `json:"labels"`
}
type cmdbWorkload struct {
	ID          int64             `json:"id"`
	Name        string            `json:"name"`
	NamespaceID int64             `json:"bk_namespace_id"`
	Labels      map[string]string `json:"labels"`
}
type cmdbNode struct {
	ID         int64             `json:"id"`
	Name       string            `json:"name"`
	HostID     int64             `json:"bk_host_id"`
	ClusterID  int64             `json:"bk_cluster_id"`
	Hostname   string            `json:"hostname"`
	Labels     map[string]string `json:"labels"`
	InternalIP []string          `json:"internal_ip"`
}
type cmdbPod struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	UID  string `json:"uid"`
}
type listData[T any] struct {
	Info []T `json:"info"`
}
type idData struct {
	ID int64 `json:"id"`
}
type idsData struct {
	IDs []int64 `json:"ids"`
}

func first[T any](items []T) (T, bool) {
	if len(items) == 0 {
		var zero T
		return zero, false
	}
	return items[0], true
}

func (c *cmdbClient) cluster(ctx context.Context, cfg Config) (int64, error) {
	var data listData[cmdbCluster]
	filter := queryFilter{Condition: "AND", Rules: []queryRule{{Field: "bk_biz_id", Operator: "equal", Value: cfg.BizID}, {Field: "uid", Operator: "equal", Value: cfg.ClusterUID}}}
	if err := c.find(ctx, "findmany/kube/cluster", cfg.BizID, filter, []string{"id", "uid", "bk_biz_id"}, &data); err != nil {
		return 0, err
	}
	if item, ok := first(data.Info); ok {
		if item.BizID != cfg.BizID {
			return 0, fmt.Errorf("cluster uid %q belongs to business %d, requested business %d", cfg.ClusterUID, item.BizID, cfg.BizID)
		}
		return item.ID, nil
	}
	var created idData
	if err := c.post(ctx, "create/kube/cluster", map[string]interface{}{
		"bk_biz_id": cfg.BizID, "name": cfg.ClusterName, "uid": cfg.ClusterUID,
		"xid": cfg.ClusterUID, "scheduling_engine": "k8s", "type": "INDEPENDENT_CLUSTER",
	}, &created); err != nil {
		return 0, err
	}
	var verify listData[cmdbCluster]
	if err := c.find(ctx, "findmany/kube/cluster", cfg.BizID, filter, []string{"id", "uid", "bk_biz_id"}, &verify); err != nil {
		return 0, err
	}
	item, ok := first(verify.Info)
	if !ok || item.ID != created.ID || item.BizID != cfg.BizID {
		return 0, fmt.Errorf("cluster create read-back failed: id=%d biz=%d requested_id=%d requested_biz=%d", item.ID, item.BizID, created.ID, cfg.BizID)
	}
	return created.ID, nil
}

func (c *cmdbClient) namespace(ctx context.Context, cfg Config, clusterID int64, name string, labels map[string]string) (int64, error) {
	var data listData[cmdbNamespace]
	filter := queryFilter{Condition: "AND", Rules: []queryRule{{Field: "bk_cluster_id", Operator: "equal", Value: clusterID}, {Field: "name", Operator: "equal", Value: name}}}
	if err := c.find(ctx, "findmany/kube/namespace", cfg.BizID, filter, []string{"id", "name", "bk_cluster_id", "labels"}, &data); err != nil {
		return 0, err
	}
	if item, ok := first(data.Info); ok {
		return item.ID, nil
	}
	var created idsData
	payload := map[string]interface{}{"bk_cluster_id": clusterID, "name": name, "labels": labels}
	err := c.post(ctx, "createmany/kube/namespace", map[string]interface{}{"bk_biz_id": cfg.BizID, "data": []interface{}{payload}}, &created)
	if err != nil || len(created.IDs) == 0 {
		return 0, fmt.Errorf("namespace create returned no id: %w", err)
	}
	return created.IDs[0], nil
}

func (c *cmdbClient) workload(ctx context.Context, cfg Config, clusterID, namespaceID int64, name string, labels map[string]string) (int64, error) {
	var data listData[cmdbWorkload]
	filter := queryFilter{Condition: "AND", Rules: []queryRule{{Field: "bk_namespace_id", Operator: "equal", Value: namespaceID}, {Field: "name", Operator: "equal", Value: name}}}
	if err := c.find(ctx, "findmany/kube/workload/pods", cfg.BizID, filter, []string{"id", "name", "bk_namespace_id"}, &data); err != nil {
		return 0, err
	}
	if item, ok := first(data.Info); ok {
		return item.ID, nil
	}
	var created idsData
	payload := map[string]interface{}{"bk_biz_id": cfg.BizID, "bk_cluster_id": clusterID, "bk_namespace_id": namespaceID, "name": name, "labels": labels, "replicas": 0}
	err := c.post(ctx, "createmany/kube/workload/pods", map[string]interface{}{"bk_biz_id": cfg.BizID, "kind": "pods", "data": []interface{}{payload}}, &created)
	if err != nil || len(created.IDs) == 0 {
		return 0, fmt.Errorf("workload create returned no id: %w", err)
	}
	return created.IDs[0], nil
}

func (c *cmdbClient) node(ctx context.Context, cfg Config, clusterID, hostID int64, name, hostname string, internalIPs []string, labels map[string]string) (int64, error) {
	var data listData[cmdbNode]
	filter := queryFilter{Condition: "AND", Rules: []queryRule{{Field: "bk_cluster_id", Operator: "equal", Value: clusterID}, {Field: "name", Operator: "equal", Value: name}}}
	if err := c.find(ctx, "findmany/kube/node", cfg.BizID, filter, []string{"id", "name", "bk_host_id", "bk_cluster_id"}, &data); err != nil {
		return 0, err
	}
	if item, ok := first(data.Info); ok {
		return item.ID, nil
	}
	var created idsData
	payload := map[string]interface{}{"bk_biz_id": cfg.BizID, "bk_cluster_id": clusterID, "bk_host_id": hostID, "name": name, "hostname": hostname, "internal_ip": internalIPs, "external_ip": []string{}, "labels": labels}
	err := c.post(ctx, "createmany/kube/node", map[string]interface{}{"bk_biz_id": cfg.BizID, "data": []interface{}{payload}}, &created)
	if err != nil || len(created.IDs) == 0 {
		return 0, fmt.Errorf("node create returned no id: %w", err)
	}
	return created.IDs[0], nil
}

func (c *cmdbClient) pod(ctx context.Context, cfg Config, clusterID, namespaceID, nodeID, hostID, workloadID int64, name, nodeName string, uid string, ip string, labels map[string]string, containers []map[string]interface{}) (int64, error) {
	var data listData[cmdbPod]
	filter := queryFilter{Condition: "AND", Rules: []queryRule{{Field: "bk_cluster_id", Operator: "equal", Value: clusterID}, {Field: "bk_namespace_id", Operator: "equal", Value: namespaceID}, {Field: "name", Operator: "equal", Value: name}}}
	if err := c.find(ctx, "findmany/kube/pod", cfg.BizID, filter, []string{"id", "name"}, &data); err != nil {
		return 0, err
	}
	if item, ok := first(data.Info); ok {
		return item.ID, nil
	}
	podPayload := map[string]interface{}{"spec": map[string]interface{}{"bk_cluster_id": clusterID, "bk_namespace_id": namespaceID, "bk_node_id": nodeID, "ref": map[string]interface{}{"kind": "pods", "id": workloadID, "name": name}}, "bk_host_id": hostID, "name": name, "operator": []string{cfg.CMDBUser}, "labels": labels, "ip": ip, "ips": []interface{}{}, "containers": containers, "node_name": nodeName}
	dataPayload := map[string]interface{}{"bk_biz_id": cfg.BizID, "pods": []interface{}{podPayload}}
	created := idsData{}
	if err := c.post(ctx, "createmany/kube/pod", map[string]interface{}{"data": []interface{}{dataPayload}}, &created); err != nil {
		return 0, err
	}
	if len(created.IDs) != 1 || created.IDs[0] <= 0 {
		return 0, fmt.Errorf("pod create returned no id")
	}
	return created.IDs[0], nil
}

func contextWithTimeout(parent context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, d)
}
