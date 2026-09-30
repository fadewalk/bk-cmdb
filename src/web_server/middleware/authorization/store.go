package authorization

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// storeTimeout bounds every Mongo round-trip; the policy store is on the
// critical path of authorization admin APIs only, never of proxied requests.
const storeTimeout = 5 * time.Second

// PolicyStore persists casbin policy and grouping lines. The standalone policy
// volume stays small (thousands of lines at most per the IAM design), so the
// store rewrites the full set on every mutation instead of tracking deltas.
type PolicyStore interface {
	Load() (policies [][]string, groupings [][]string, err error)
	Save(policies, groupings [][]string) error
}

// policyLine mirrors the casbin mongodb-adapter document shape so external
// tooling can read or seed the collection directly.
type policyLine struct {
	Ptype string   `bson:"ptype"`
	V     []string `bson:"v"`
}

// MongoStore keeps policies in the cc_Policy collection of the CMDB database.
type MongoStore struct {
	client     *mongo.Client
	database   string
	collection string
}

// NewMongoStore connects to uri. The URI must carry the database in its path,
// e.g. mongodb://user:pass@host:27017/cmdb.
func NewMongoStore(uri, collection string) (*MongoStore, error) {
	if strings.TrimSpace(uri) == "" {
		return nil, fmt.Errorf("mongo uri is required")
	}
	if collection == "" {
		collection = "cc_Policy"
	}
	parsed, err := url.Parse(uri)
	if err != nil {
		return nil, fmt.Errorf("parse mongo uri failed: %w", err)
	}
	database := strings.TrimPrefix(parsed.Path, "/")
	if database == "" {
		return nil, fmt.Errorf("mongo uri must include the database path, e.g. mongodb://host/cmdb")
	}
	ctx, cancel := context.WithTimeout(context.Background(), storeTimeout)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("connect policy mongo failed: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping policy mongo failed: %w", err)
	}
	return &MongoStore{client: client, database: database, collection: collection}, nil
}

// Load returns persisted p and g lines; an empty collection yields empty sets,
// which the authorizer treats as "first run" and seeds with bootstrap rules.
func (s *MongoStore) Load() ([][]string, [][]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), storeTimeout)
	defer cancel()
	cursor, err := s.coll().Find(ctx, bson.M{})
	if err != nil {
		return nil, nil, fmt.Errorf("load policies failed: %w", err)
	}
	defer cursor.Close(ctx)
	var policies, groupings [][]string
	for cursor.Next(ctx) {
		var line policyLine
		if err := cursor.Decode(&line); err != nil {
			return nil, nil, fmt.Errorf("decode policy line failed: %w", err)
		}
		if len(line.V) == 0 {
			continue
		}
		switch line.Ptype {
		case "p":
			policies = append(policies, line.V)
		case "g":
			groupings = append(groupings, line.V)
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate policies failed: %w", err)
	}
	return policies, groupings, nil
}

// Save replaces the whole persisted set.
func (s *MongoStore) Save(policies, groupings [][]string) error {
	ctx, cancel := context.WithTimeout(context.Background(), storeTimeout)
	defer cancel()
	coll := s.coll()
	if _, err := coll.DeleteMany(ctx, bson.M{}); err != nil {
		return fmt.Errorf("clear policies failed: %w", err)
	}
	docs := make([]interface{}, 0, len(policies)+len(groupings))
	for _, line := range policies {
		docs = append(docs, policyLine{Ptype: "p", V: line})
	}
	for _, line := range groupings {
		docs = append(docs, policyLine{Ptype: "g", V: line})
	}
	if len(docs) == 0 {
		return nil
	}
	if _, err := coll.InsertMany(ctx, docs); err != nil {
		return fmt.Errorf("insert policies failed: %w", err)
	}
	return nil
}

// Close disconnects the underlying client.
func (s *MongoStore) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), storeTimeout)
	defer cancel()
	return s.client.Disconnect(ctx)
}

func (s *MongoStore) coll() *mongo.Collection {
	return s.client.Database(s.database).Collection(s.collection)
}
