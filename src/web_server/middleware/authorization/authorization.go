package authorization

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"configcenter/src/common"
	"configcenter/src/web_server/app/options"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const modelText = `[request_definition]
r = sub, dom, obj, act
[policy_definition]
p = sub, dom, obj, act, eft
[role_definition]
g = _, _, _
[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))
[matchers]
m = (g(r.sub, p.sub, r.dom) || g(r.sub, p.sub, "*")) && (r.dom == p.dom || p.dom == "*") && keyMatch2(r.obj, p.obj) && (r.act == p.act || p.act == "*")`

// Authorizer is the standalone edge policy evaluator. It is intentionally
// independent from the legacy BlueKing IAM client and disabled by default.
// With a PolicyStore attached, mutations persist and Reload re-reads the store;
// without one, policies live in process memory and reset to the bootstrap seed
// on restart.
type Authorizer struct {
	enforcer *casbin.Enforcer
	store    PolicyStore
	cfg      options.Authorization
}

// BizAdminRole is the domain-scoped creator role: bound per business domain,
// it grants full resource control inside that domain only. Domain scope comes
// from the grouping (g, subject, biz_admin, <bizId>); the role policy itself
// is domain-agnostic, matching the standard casbin domain pattern. It never
// confers iam:admin, whose check runs with domain "*".
const BizAdminRole = "biz_admin"

// BaselineUserRole is bound to every authenticated user at login (domain "*"):
// read-only access across the resource families the UI reads on every page.
// Writes stay denied until approved (in-app application) or creator-granted.
const BaselineUserRole = "user"

// baselineReadObjects mirrors PermissionForPath's object key space: the read
// API families the UI hits on every page (lists, detail, statistics, topo).
var baselineReadObjects = []string{"biz", "instance", "host", "search", "count", "topo", "object", "usercustom"}

// baselineExtraGrants are per-user self-data writes allowed with the baseline
// role (usercustom is the user's own preference store).
var baselineExtraGrants = [][2]string{{"usercustom", "create"}}

// seed applies the built-in admin rules and bootstrap user bindings. They are
// re-applied on every start/reload so a broken policy store can never lock the
// bootstrap administrator out.
func seed(e *casbin.Enforcer, cfg options.Authorization) error {
	if _, err := e.AddPolicy("admin", "*", "*", "*", "allow"); err != nil {
		return err
	}
	if _, err := e.AddGroupingPolicy("admin", "admin", "*"); err != nil {
		return err
	}
	if _, err := e.AddPolicy(BizAdminRole, "*", "*", "*", "allow"); err != nil {
		return err
	}
	for _, object := range baselineReadObjects {
		if _, err := e.AddPolicy(BaselineUserRole, "*", object, "read", "allow"); err != nil {
			return err
		}
	}
	for _, grant := range baselineExtraGrants {
		if _, err := e.AddPolicy(BaselineUserRole, "*", grant[0], grant[1], "allow"); err != nil {
			return err
		}
	}
	for _, user := range cfg.BootstrapUsers {
		if strings.TrimSpace(user) == "" {
			continue
		}
		if _, err := e.AddGroupingPolicy(user, "admin", "*"); err != nil {
			return err
		}
	}
	return nil
}

// New builds the authorizer. Passing a store enables persistence: policies are
// loaded from the store on start (bootstrap rules always stay) and every
// mutation is written back.
func New(cfg options.Authorization, store ...PolicyStore) (*Authorizer, error) {
	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return nil, err
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return nil, err
	}
	if err := seed(e, cfg); err != nil {
		return nil, err
	}
	a := &Authorizer{enforcer: e, cfg: cfg}
	if len(store) > 0 && store[0] != nil {
		a.store = store[0]
		if err := a.reloadFromStore(); err != nil {
			return nil, err
		}
	}
	return a, nil
}

func (a *Authorizer) reloadFromStore() error {
	policies, groupings, err := a.store.Load()
	if err != nil {
		return err
	}
	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return err
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return err
	}
	if err := seed(e, a.cfg); err != nil {
		return err
	}
	for _, policy := range policies {
		if _, err := e.AddPolicy(policy); err != nil {
			return fmt.Errorf("apply persisted policy %v failed: %w", policy, err)
		}
	}
	for _, grouping := range groupings {
		if _, err := e.AddGroupingPolicy(grouping); err != nil {
			return fmt.Errorf("apply persisted grouping %v failed: %w", grouping, err)
		}
	}
	a.enforcer = e
	return a.save()
}

// Reload re-applies persisted policies from the store. It is a no-op without a
// store (the in-memory implementation has nothing to reload from).
func (a *Authorizer) Reload() error {
	if a == nil || a.store == nil {
		return nil
	}
	return a.reloadFromStore()
}

func (a *Authorizer) save() error {
	policies, err := a.enforcer.GetPolicy()
	if err != nil {
		return err
	}
	groupings, err := a.enforcer.GetGroupingPolicy()
	if err != nil {
		return err
	}
	return a.store.Save(policies, groupings)
}

func (a *Authorizer) Enforce(subject, domain, object, action string) (bool, error) {
	if a == nil || a.enforcer == nil {
		return true, nil
	}
	return a.enforcer.Enforce(subject, domain, object, action)
}

func (a *Authorizer) Policies() ([][]string, error) {
	if a == nil || a.enforcer == nil {
		return nil, nil
	}
	return a.enforcer.GetPolicy()
}

func (a *Authorizer) AddPolicy(policy []string) (bool, error) {
	if a == nil || a.enforcer == nil || len(policy) != 5 {
		return false, fmt.Errorf("policy must contain 5 fields")
	}
	added, err := a.enforcer.AddPolicy(policy)
	if err == nil && added {
		if saveErr := a.persist(func() error {
			_, rbErr := a.enforcer.RemovePolicy(policy)
			return rbErr
		}); saveErr != nil {
			return false, saveErr
		}
	}
	return added, err
}

func (a *Authorizer) RemovePolicy(policy []string) (bool, error) {
	if a == nil || a.enforcer == nil || len(policy) != 5 {
		return false, fmt.Errorf("policy must contain 5 fields")
	}
	removed, err := a.enforcer.RemovePolicy(policy)
	if err == nil && removed {
		if saveErr := a.persist(func() error {
			_, rbErr := a.enforcer.AddPolicy(policy)
			return rbErr
		}); saveErr != nil {
			return false, saveErr
		}
	}
	return removed, err
}

func (a *Authorizer) Groupings() ([][]string, error) {
	if a == nil || a.enforcer == nil {
		return nil, nil
	}
	return a.enforcer.GetGroupingPolicy()
}

func (a *Authorizer) AddGrouping(subject, role, domain string) (bool, error) {
	if a == nil || a.enforcer == nil || subject == "" || role == "" {
		return false, fmt.Errorf("subject and role are required")
	}
	added, err := a.enforcer.AddGroupingPolicy(subject, role, domain)
	if err == nil && added {
		if saveErr := a.persist(func() error {
			_, rbErr := a.enforcer.RemoveGroupingPolicy(subject, role, domain)
			return rbErr
		}); saveErr != nil {
			return false, saveErr
		}
	}
	return added, err
}

func (a *Authorizer) RemoveGrouping(subject, role, domain string) (bool, error) {
	if a == nil || a.enforcer == nil || subject == "" || role == "" {
		return false, fmt.Errorf("subject and role are required")
	}
	removed, err := a.enforcer.RemoveGroupingPolicy(subject, role, domain)
	if err == nil && removed {
		if saveErr := a.persist(func() error {
			_, rbErr := a.enforcer.AddGroupingPolicy(subject, role, domain)
			return rbErr
		}); saveErr != nil {
			return false, saveErr
		}
	}
	return removed, err
}

// persist saves the full policy set through the store when one is attached;
// on persist failure the rollback undoes the in-memory change so memory and
// store never diverge.
func (a *Authorizer) persist(rollback func() error) error {
	if a.store == nil {
		return nil
	}
	if err := a.save(); err != nil {
		if rbErr := rollback(); rbErr != nil {
			return fmt.Errorf("persist policy failed: %v (rollback failed: %v)", err, rbErr)
		}
		return fmt.Errorf("persist policy failed: %w", err)
	}
	return nil
}

func Subject(c *gin.Context) string { return subject(c) }

var bizIDPattern = regexp.MustCompile(`(?:^|/)(?:biz|business|project|bk_biz_id)/?(\d+)`)

// PermissionForPath maps the current CMDB API surface to coarse-grained
// permissions. Resource-level filtering remains the responsibility of the
// existing ac.AuthorizeInterface; this middleware is the standalone edge gate.
func PermissionForPath(method, path string) (object, action, domain string, ok bool) {
	clean := strings.TrimPrefix(path, "/")
	clean = strings.TrimPrefix(clean, "api/v3/")
	parts := strings.Split(clean, "/")
	if len(parts) == 0 || parts[0] == "" {
		return "", "", "", false
	}
	object = parts[0]
	switch object {
	case "table":
		object = "biz"
	case "hosts":
		object = "host"
	case "insts", "findmany", "find":
		object = "instance"
	case "create", "update", "delete", "deletemany", "updatemany", "createmany":
		if len(parts) > 1 {
			object = parts[1]
		}
	}
	switch method {
	case http.MethodGet, http.MethodHead:
		action = "read"
	case http.MethodPost:
		action = "create"
	case http.MethodPut, http.MethodPatch:
		action = "update"
	case http.MethodDelete:
		action = "delete"
	default:
		return "", "", "", false
	}
	if method == http.MethodPost && (strings.Contains(clean, "find") || strings.Contains(clean, "search") || strings.Contains(clean, "list")) {
		action = "read"
	}
	if method == http.MethodPost && (strings.Contains(clean, "export") || strings.Contains(clean, "download")) {
		action = "export"
	}
	if match := bizIDPattern.FindStringSubmatch(clean); len(match) == 2 {
		domain = match[1]
	} else {
		domain = "*"
	}
	return object, action, domain, true
}

func subject(c *gin.Context) string {
	if user := c.GetHeader("X-Bkcmdb-User"); user != "" {
		return user
	}
	s := sessions.Default(c)
	name, _ := s.Get(common.WEBSessionUinKey).(string)
	if name == "" {
		name = "anonymous"
	}
	return name
}

// Middleware is a no-op when disabled. It must be mounted after the API-Key
// proxy and before ValidLogin so both machine and browser identities are seen.
func Middleware(a *Authorizer, enabled bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !enabled || isPublic(c.Request.URL.Path) {
			c.Next()
			return
		}
		obj, act, dom, ok := PermissionForPath(c.Request.Method, c.Request.URL.Path)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"status": "permission denied", "reason": "unknown permission"})
			c.Abort()
			return
		}
		allowed, err := a.Enforce(subject(c), dom, obj, act)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": fmt.Sprintf("permission check failed: %v", err)})
			c.Abort()
			return
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"status": "permission denied", "object": obj, "action": act, "domain": dom})
			c.Abort()
			return
		}
		c.Next()
	}
}

func isPublic(path string) bool {
	p := strings.TrimPrefix(path, "/")
	// Root serves the hash-router document (index.html); the SPA shell must
	// load for any authenticated user before per-API authorization applies.
	if p == "" {
		return true
	}
	// Self-permission endpoints must stay reachable for any authenticated user
	// (the UI renders its own permission states and submits applications from
	// them); they gate users internally. Admin endpoints keep the edge check
	// plus iamAdmin.
	if p == "iam/me/permissions" || p == "iam/verify" || p == "iam/status" || p == "iam/apply" {
		return true
	}
	return p == "healthz" || p == "metrics" || p == "favicon.ico" || strings.HasPrefix(p, "static") || p == "login" || strings.HasPrefix(p, "login/") || p == "is_login" || p == "userinfo" || p == "logout" || p == "version"
}
