package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------- Группы (сайдбар) ----------

type group struct {
	ID          int64  `json:"id"`
	GroupTypeID int64  `json:"group_type_id"`
	Name        string `json:"name"`
}

func groupsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		rows, err := pool.Query(r.Context(),
			`SELECT id, group_type_id, name FROM groups ORDER BY id`)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		groups := []group{}
		for rows.Next() {
			var g group
			if err := rows.Scan(&g.ID, &g.GroupTypeID, &g.Name); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			groups = append(groups, g)
		}
		json.NewEncoder(w).Encode(groups)
	}
}

// ---------- Объекты ----------

type object struct {
	ID         int64  `json:"id"`
	TypeID     int64  `json:"object_type_id"`
	TypeName   string `json:"object_type_name"`
	ParentID   *int64 `json:"parent_id"`
	ParentName string `json:"parent_name"`
	Name       string `json:"name"`
	EarTag     string `json:"ear_tag"`
}

// objectsHandler — объекты группы (group_id) или всё активное дерево (без group_id).
func objectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		groupID := r.URL.Query().Get("group_id")

		query := `
			SELECT o.id, o.object_type_id, ot.name, o.parent_id, COALESCE(p.name, ''),
			       o.name, COALESCE(oi.value, '')
			FROM objects o
			JOIN object_types ot ON ot.id = o.object_type_id
			LEFT JOIN objects p ON p.id = o.parent_id
			LEFT JOIN object_identifiers oi ON oi.object_id = o.id AND oi.id_type = 'ear_tag'
			WHERE o.is_active`
		var args []interface{}

		// Совместимость со старым API: фильтр по группе через m:n таблицу
		if groupID != "" {
			query += ` AND EXISTS (SELECT 1 FROM object_groups og WHERE og.object_id = o.id AND og.group_id = $1)`
			args = append(args, groupID)
		}
		query += ` ORDER BY o.name`

		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		objects := []object{}
		for rows.Next() {
			var o object
			if err := rows.Scan(&o.ID, &o.TypeID, &o.TypeName, &o.ParentID, &o.ParentName, &o.Name, &o.EarTag); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			objects = append(objects, o)
		}
		json.NewEncoder(w).Encode(objects)
	}
}

// ---------- Показатели для типа объекта ----------

type measure struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Unit        string `json:"unit"`
	MeasureType string `json:"measure_type"`
}

func measuresHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		objectTypeID := r.URL.Query().Get("object_type_id")
		if objectTypeID == "" {
			http.Error(w, `{"error":"object_type_id required"}`, http.StatusBadRequest)
			return
		}

		rows, err := pool.Query(r.Context(), `
			SELECT m.id, m.name, COALESCE(m.unit, ''), m.measure_type
			FROM measures m
			JOIN measure_to_object_type mt ON mt.measure_id = m.id
			WHERE mt.object_type_id = $1
			ORDER BY m.id`, objectTypeID)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		measures := []measure{}
		for rows.Next() {
			var m measure
			if err := rows.Scan(&m.ID, &m.Name, &m.Unit, &m.MeasureType); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			measures = append(measures, m)
		}
		json.NewEncoder(w).Encode(measures)
	}
}

// ---------- Значения показателей ----------

type measureValue struct {
	ID         int64     `json:"id"`
	MeasureID  int64     `json:"measure_id"`
	Measure    string    `json:"measure_name"`
	Unit       string    `json:"unit"`
	ObjectID   int64     `json:"object_id"`
	Value      float64   `json:"value"`
	MeasuredAt time.Time `json:"measured_at"`
	DeviceID   string    `json:"device_id"`
}

func measureValuesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		objectID := r.URL.Query().Get("object_id")
		if objectID == "" {
			http.Error(w, `{"error":"object_id required"}`, http.StatusBadRequest)
			return
		}

		rows, err := pool.Query(r.Context(), `
			SELECT mv.id, mv.measure_id, m.name, COALESCE(m.unit, ''),
			       mv.object_id, mv.value, mv.measured_at, mv.device_id
			FROM measure_values mv
			JOIN measures m ON m.id = mv.measure_id
			WHERE mv.object_id = $1
			ORDER BY mv.measured_at DESC
			LIMIT 50`, objectID)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		values := []measureValue{}
		for rows.Next() {
			var v measureValue
			if err := rows.Scan(&v.ID, &v.MeasureID, &v.Measure, &v.Unit,
				&v.ObjectID, &v.Value, &v.MeasuredAt, &v.DeviceID); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			values = append(values, v)
		}
		json.NewEncoder(w).Encode(values)
	}
}

type createValueRequest struct {
	ClientUUID string    `json:"client_uuid"`
	MeasureID  int64     `json:"measure_id"`
	ObjectID   int64     `json:"object_id"`
	Value      float64   `json:"value"`
	MeasuredAt time.Time `json:"measured_at"`
	DeviceID   string    `json:"device_id"`
}

// createMeasureValueHandler — одно значение. client_uuid обеспечивает идемпотентность.
func createMeasureValueHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		insertValue(w, r, pool, false)
	}
}

// syncHandler — пакетная выгрузка оффлайн-очереди с устройства.
func syncHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		insertValue(w, r, pool, true)
	}
}

func insertValue(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, batch bool) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Пакетный режим: {"values": [...]}
	if batch {
		var req struct {
			Values []createValueRequest `json:"values"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}

		inserted, skipped := 0, 0
		for _, v := range req.Values {
			ok, err := insertOne(r, pool, v)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			if ok {
				inserted++
			} else {
				skipped++
			}
		}
		json.NewEncoder(w).Encode(map[string]int{"inserted": inserted, "skipped": skipped})
		return
	}

	// Одиночный режим
	var v createValueRequest
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	ok, err := insertOne(r, pool, v)
	if err != nil {
		http.Error(w, `{"error":"db error: "}`, http.StatusInternalServerError)
		return
	}
	if !ok {
		// Дубль client_uuid — уже синхронизировано
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "duplicate"})
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "created"})
}

func insertOne(r *http.Request, pool *pgxpool.Pool, v createValueRequest) (bool, error) {
	if v.MeasuredAt.IsZero() {
		v.MeasuredAt = time.Now()
	}
	if v.DeviceID == "" {
		v.DeviceID = "unknown"
	}
	if v.ClientUUID == "" {
		v.ClientUUID = newUUID()
	}

	// Получаем author_id из контекста
	authorID, _ := r.Context().Value("userId").(int64)

	tag, err := pool.Exec(r.Context(), `
		INSERT INTO measure_values (client_uuid, measure_id, object_id, value, measured_at, device_id, author_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (client_uuid) DO NOTHING`,
		v.ClientUUID, v.MeasureID, v.ObjectID, v.Value, v.MeasuredAt, v.DeviceID, authorID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
