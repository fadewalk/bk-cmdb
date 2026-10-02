package service

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"configcenter/src/common/blog"
	httpheader "configcenter/src/common/http/header"
	"configcenter/src/web_server/middleware/authorization"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// storeApplyTimeout bounds every apply-store round-trip.
const storeApplyTimeout = 5 * time.Second

// iamApplication is one in-app permission request. Approval writes a durable
// allow policy through the authorizer (which persists when a policy store is
// configured); the request record itself follows the same persistence choice.
type iamApplication struct {
	ID        string    `json:"id" bson:"_id"`
	Subject   string    `json:"subject" bson:"subject"`
	Object    string    `json:"object" bson:"object"`
	Action    string    `json:"action" bson:"action"`
	Domain    string    `json:"domain" bson:"domain"`
	Reason    string    `json:"reason" bson:"reason"`
	Status    string    `json:"status" bson:"status"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
	DecidedAt time.Time `json:"decided_at" bson:"decided_at"`
}

const (
	iamApplyPending  = "pending"
	iamApplyApproved = "approved"
	iamApplyRejected = "rejected"
)

type applyStore interface {
	Save(app *iamApplication) error
	List() ([]iamApplication, error)
	Get(id string) (*iamApplication, error)
	UpdateStatus(id, status string, decidedAt time.Time) error
}

// memoryApplyStore keeps requests in process memory. Durable decisions still
// reach cc_Policy through the authorizer, so only pending requests and history
// are lost on restart; acceptable for the no-mongoUri standalone mode.
type memoryApplyStore struct {
	mu     sync.Mutex
	seq    int64
	byID   map[string]*iamApplication
	setIDs []string
}

func newMemoryApplyStore() *memoryApplyStore {
	return &memoryApplyStore{byID: make(map[string]*iamApplication)}
}

func (m *memoryApplyStore) nextID() string {
	return fmt.Sprintf("a%d-%d", time.Now().UnixNano(), atomic.AddInt64(&m.seq, 1))
}

func (m *memoryApplyStore) Save(app *iamApplication) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if app.ID == "" {
		app.ID = m.nextID()
	}
	cp := *app
	m.byID[app.ID] = &cp
	m.setIDs = append(m.setIDs, app.ID)
	return nil
}

func (m *memoryApplyStore) List() ([]iamApplication, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]iamApplication, 0, len(m.setIDs))
	for i := len(m.setIDs) - 1; i >= 0; i-- {
		if app, ok := m.byID[m.setIDs[i]]; ok {
			out = append(out, *app)
		}
	}
	return out, nil
}

func (m *memoryApplyStore) Get(id string) (*iamApplication, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if app, ok := m.byID[id]; ok {
		cp := *app
		return &cp, nil
	}
	return nil, fmt.Errorf("application %s not found", id)
}

func (m *memoryApplyStore) UpdateStatus(id, status string, decidedAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	app, ok := m.byID[id]
	if !ok {
		return fmt.Errorf("application %s not found", id)
	}
	app.Status = status
	app.DecidedAt = decidedAt
	return nil
}

// mongoApplyStore persists requests in cc_IAMRequest of the policy database.
type mongoApplyStoreReal struct {
	coll *mongo.Collection
}

func (m *mongoApplyStoreReal) Save(app *iamApplication) error {
	ctx, cancel := context.WithTimeout(context.Background(), storeApplyTimeout)
	defer cancel()
	if app.ID == "" {
		app.ID = primitive.NewObjectID().Hex()
	}
	_, err := m.coll.InsertOne(ctx, app)
	return err
}

func (m *mongoApplyStoreReal) List() ([]iamApplication, error) {
	ctx, cancel := context.WithTimeout(context.Background(), storeApplyTimeout)
	defer cancel()
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := m.coll.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := make([]iamApplication, 0)
	if err := cursor.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (m *mongoApplyStoreReal) Get(id string) (*iamApplication, error) {
	ctx, cancel := context.WithTimeout(context.Background(), storeApplyTimeout)
	defer cancel()
	var app iamApplication
	err := m.coll.FindOne(ctx, bson.M{"_id": id}).Decode(&app)
	if err != nil {
		return nil, err
	}
	return &app, nil
}

func (m *mongoApplyStoreReal) UpdateStatus(id, status string, decidedAt time.Time) error {
	ctx, cancel := context.WithTimeout(context.Background(), storeApplyTimeout)
	defer cancel()
	res, err := m.coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": status, "decided_at": decidedAt}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("application %s not found", id)
	}
	return nil
}

// newApplyStore picks Mongo persistence when a policy store exists, memory
// otherwise. Wired once during authorization initialization.
func newApplyStore(policy *authorization.MongoStore) applyStore {
	if policy != nil {
		return &mongoApplyStoreReal{coll: policy.Collection("cc_IAMRequest")}
	}
	return newMemoryApplyStore()
}

type iamApplyRequest struct {
	Object string `json:"object"`
	Action string `json:"action"`
	Domain string `json:"domain"`
	Reason string `json:"reason"`
}

// IAMApply records a permission request from the current user. Self-service:
// reachable by any authenticated user (edge-exempt like /iam/verify).
func (s *Service) IAMApply(c *gin.Context) {
	if !s.iamEnabled(c) {
		return
	}
	var req iamApplyRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Object) == "" || strings.TrimSpace(req.Action) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "object and action are required"})
		return
	}
	domain := strings.TrimSpace(req.Domain)
	if domain == "" {
		domain = "*"
	}
	app := &iamApplication{
		Subject:   authorization.Subject(c),
		Object:    strings.TrimSpace(req.Object),
		Action:    strings.TrimSpace(req.Action),
		Domain:    domain,
		Reason:    strings.TrimSpace(req.Reason),
		Status:    iamApplyPending,
		CreatedAt: time.Now(),
	}
	if err := s.applyStore.Save(app); err != nil {
		blog.Errorf("save iam application failed, err: %v, rid: %s", err, httpheader.GetRid(c.Request.Header))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": app.ID, "status": app.Status})
}

// IAMApplyList returns all applications, newest first. Authorization admin only.
func (s *Service) IAMApplyList(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	apps, err := s.applyStore.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"applications": apps})
}

type iamApplyDecisionRequest struct {
	ID      string `json:"id"`
	Approve bool   `json:"approve"`
}

// IAMApplyDecision approves or rejects a pending request. Approval writes the
// durable allow policy for the requesting subject immediately.
func (s *Service) IAMApplyDecision(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	var req iamApplyDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.ID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id is required"})
		return
	}
	app, err := s.applyStore.Get(req.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if app.Status != iamApplyPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("application already %s", app.Status)})
		return
	}
	now := time.Now()
	if req.Approve {
		if _, err := s.Policy.AddPolicy([]string{app.Subject, app.Domain, app.Object, app.Action, "allow"}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("write policy failed: %v", err)})
			return
		}
	}
	status := iamApplyRejected
	if req.Approve {
		status = iamApplyApproved
	}
	if err := s.applyStore.UpdateStatus(req.ID, status, now); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	app.Status = status
	app.DecidedAt = now
	c.JSON(http.StatusOK, gin.H{"application": app})
}
