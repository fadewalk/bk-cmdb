package authorization

import (
	"net/http"
	"testing"

	"configcenter/src/web_server/app/options"
)

func TestPermissionForPath(t *testing.T) {
	tests := []struct {
		method, path, object, action, domain string
		ok                                   bool
	}{
		{http.MethodGet, "/api/v3/findmany/project", "instance", "read", "*", true},
		{http.MethodPost, "/api/v3/table/biz/0", "biz", "create", "0", true},
		{http.MethodDelete, "/api/v3/deletemany/project", "project", "delete", "*", true},
		// §4.2 资源类型映射关键路径
		{http.MethodPut, "/api/v3/biz/2", "biz", "update", "2", true},
		{http.MethodGet, "/api/v3/topo/internal/0/2/with_statistics", "topo", "read", "*", true},
		{http.MethodPost, "/api/v3/hosts/search", "host", "read", "*", true},
		{http.MethodPost, "/api/v3/hosts/export", "host", "export", "*", true},
		{http.MethodDelete, "/api/v3/delete/cloud/account/5", "cloud", "delete", "*", true},
		{http.MethodGet, "/api/v3/findmany/audit_list", "instance", "read", "*", true},
		{http.MethodPost, "/api/v3/create/proc/service_template", "proc", "create", "*", true},
		// 公共路径由 middleware isPublic 放行,归一器本身按普通对象处理
		{http.MethodGet, "/api/v3/healthz", "healthz", "read", "*", true},
	}
	for _, tt := range tests {
		object, action, domain, ok := PermissionForPath(tt.method, tt.path)
		if ok != tt.ok || object != tt.object || action != tt.action || domain != tt.domain {
			t.Fatalf("PermissionForPath(%s,%s)=(%q,%q,%q,%v), want (%q,%q,%q,%v)", tt.method, tt.path, object, action, domain, ok, tt.object, tt.action, tt.domain, tt.ok)
		}
	}
}

func TestAuthorizerBootstrapAdmin(t *testing.T) {
	a, err := New(options.Authorization{BootstrapUsers: []string{"alice"}})
	if err != nil {
		t.Fatal(err)
	}
	allowed, err := a.Enforce("alice", "2", "project", "delete")
	if err != nil || !allowed {
		t.Fatalf("bootstrap user not allowed: %v %v", allowed, err)
	}
	allowed, err = a.Enforce("bob", "2", "project", "delete")
	if err != nil {
		t.Fatal(err)
	}
	if allowed {
		t.Fatal("unbound user unexpectedly allowed")
	}
}

type fakeStore struct {
	policies  [][]string
	groupings [][]string
	saves     int
}

func (f *fakeStore) Load() ([][]string, [][]string, error) {
	return f.policies, f.groupings, nil
}

func (f *fakeStore) Save(policies, groupings [][]string) error {
	f.policies, f.groupings = policies, groupings
	f.saves++
	return nil
}

func TestAuthorizerWithStore(t *testing.T) {
	store := &fakeStore{
		policies:  [][]string{{"dev", "2", "biz", "update", "allow"}},
		groupings: [][]string{{"bob", "dev", "2"}},
	}
	a, err := New(options.Authorization{}, store)
	if err != nil {
		t.Fatal(err)
	}
	// bootstrap 种子规则始终生效
	if allowed, _ := a.Enforce("admin", "*", "host", "delete"); !allowed {
		t.Fatal("bootstrap admin policy lost on store load")
	}
	// 持久化策略在启动时生效
	if allowed, err := a.Enforce("bob", "2", "biz", "update"); err != nil || !allowed {
		t.Fatalf("persisted policy not enforced: %v %v", allowed, err)
	}
	if allowed, _ := a.Enforce("bob", "2", "biz", "delete"); allowed {
		t.Fatal("persisted policy over-authorized")
	}
	// 变更写回 store
	if _, err := a.AddGrouping("carol", "dev", "2"); err != nil {
		t.Fatal(err)
	}
	if store.saves < 1 {
		t.Fatal("AddGrouping did not persist")
	}
	if allowed, _ := a.Enforce("carol", "2", "biz", "update"); !allowed {
		t.Fatal("added grouping not enforced")
	}
	// RemoveGrouping 同样写回
	if _, err := a.RemoveGrouping("carol", "dev", "2"); err != nil {
		t.Fatal(err)
	}
	if allowed, _ := a.Enforce("carol", "2", "biz", "update"); allowed {
		t.Fatal("removed grouping still enforced")
	}
	// Reload 拾取带外变更(模拟另一进程直接改 cc_Policy 后热加载)
	store.policies = append(store.policies, []string{"temp", "*", "biz", "update", "allow"})
	if err := a.Reload(); err != nil {
		t.Fatal(err)
	}
	if allowed, _ := a.Enforce("temp", "9", "biz", "update"); !allowed {
		t.Fatal("reload did not pick up out-of-band policy")
	}
	if allowed, _ := a.Enforce("bob", "2", "biz", "update"); !allowed {
		t.Fatal("reload lost persisted grouping")
	}
	// 带外删除后 Reload 同样收敛
	store.policies = nil
	if err := a.Reload(); err != nil {
		t.Fatal(err)
	}
	if allowed, _ := a.Enforce("temp", "9", "biz", "update"); allowed {
		t.Fatal("reload kept out-of-band deleted policy")
	}
}
