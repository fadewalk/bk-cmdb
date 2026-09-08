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
type Authorizer struct {
	enforcer *casbin.Enforcer
}

func New(cfg options.Authorization) (*Authorizer, error) {
	m, err := model.NewModelFromString(modelText)
	if err != nil {
		return nil, err
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return nil, err
	}
	if _, err := e.AddPolicy("admin", "*", "*", "*", "allow"); err != nil {
		return nil, err
	}
	for _, user := range cfg.BootstrapUsers {
		if strings.TrimSpace(user) == "" {
			continue
		}
		if _, err := e.AddGroupingPolicy(user, "admin", "*"); err != nil {
			return nil, err
		}
	}
	return &Authorizer{enforcer: e}, nil
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
	case "create", "update", "delete", "deletemany", "updatemany":
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
	return p == "healthz" || p == "metrics" || p == "static" || p == "login" || strings.HasPrefix(p, "login/") || p == "is_login" || p == "version"
}
