package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ========== Admin: управление объектами ==========

type adminObject struct {
	ID         int64     `json:"id"`
	TypeID     int64     `json:"object_type_id"`
	TypeName   string    `json:"object_type_name"`
	ParentID   *int64    `json:"parent_id"`
	ParentName string    `json:"parent_name"`
	Name       string    `json:"name"`
	EarTag     string    `json:"ear_tag"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
}

func adminObjectsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// GET — список всех объектов
		if r.Method == http.MethodGet {
			objectTypeID := r.URL.Query().Get("type_id")
			query := `
				SELECT o.id, o.object_type_id, ot.name, o.parent_id, COALESCE(p.name, ''),
				       o.name, COALESCE(oi.value, ''), o.is_active, o.created_at
				FROM objects o
				JOIN object_types ot ON ot.id = o.object_type_id
				LEFT JOIN objects p ON p.id = o.parent_id
				LEFT JOIN object_identifiers oi ON oi.object_id = o.id AND oi.id_type = 'ear_tag'`
			var args []interface{}
			if objectTypeID != "" {
				query += " WHERE o.object_type_id = $1"
				args = append(args, objectTypeID)
			}
			query += " ORDER BY o.name"

			rows, err := pool.Query(r.Context(), query, args...)
			if err != nil {
				log.Printf("adminObjects GET error: %v", err)
				http.Error(w, fmt.Sprintf(`{"error":"db error: %v"}`, err), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			objects := []adminObject{}
			for rows.Next() {
				var o adminObject
				if err := rows.Scan(&o.ID, &o.TypeID, &o.TypeName, &o.ParentID, &o.ParentName,
					&o.Name, &o.EarTag, &o.IsActive, &o.CreatedAt); err != nil {
					http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
					return
				}
				objects = append(objects, o)
			}
			json.NewEncoder(w).Encode(objects)
			return
		}

		// POST — создание объекта
		if r.Method == http.MethodPost {
			var req struct {
				TypeID   int64  `json:"type_id"`
				ParentID *int64 `json:"parent_id"`
				Name     string `json:"name"`
				EarTag   string `json:"ear_tag"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
				return
			}

			// Проверяем, что тип объекта существует
			var typeExists bool
			pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM object_types WHERE id = $1)`, req.TypeID).Scan(&typeExists)
			if !typeExists {
				http.Error(w, `{"error":"object type not found"}`, http.StatusBadRequest)
				return
			}

			// Если указан родитель — проверяем, что он существует
			if req.ParentID != nil {
				var parentExists bool
				pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM objects WHERE id = $1)`, *req.ParentID).Scan(&parentExists)
				if !parentExists {
					http.Error(w, `{"error":"parent object not found"}`, http.StatusBadRequest)
					return
				}
			}

			id, err := insertObject(r, pool, req.TypeID, req.ParentID, req.Name)
			if err != nil {
				// 23505 — нарушение UNIQUE (object_type_id, name): такой объект уже есть
				if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
					http.Error(w, `{"error":"объект с таким именем уже существует"}`, http.StatusConflict)
					return
				}
				log.Printf("adminObjects POST error: %v", err)
				http.Error(w, fmt.Sprintf(`{"error":"db error: %v"}`, err), http.StatusInternalServerError)
				return
			}

			// Если есть бирка — добавляем
			if req.EarTag != "" {
				pool.Exec(r.Context(), `
					INSERT INTO object_identifiers (object_id, id_type, value)
					VALUES ($1, 'ear_tag', $2)
					ON CONFLICT (id_type, value) DO NOTHING`, id, req.EarTag)
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]int64{"id": id})
			return
		}

		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// insertObject — создание объекта с опциональным родителем, возвращает ID.
func insertObject(r *http.Request, pool *pgxpool.Pool, typeID int64, parentID *int64, name string) (int64, error) {
	var id int64
	err := pool.QueryRow(r.Context(), `
		INSERT INTO objects (object_type_id, parent_id, name, created_at)
		VALUES ($1, $2, $3, now())
		RETURNING id`, typeID, parentID, name).Scan(&id)
	return id, err
}

type objectRequest struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	EarTag   string `json:"ear_tag"`
	IsActive *bool  `json:"is_active"`
}

func adminObjectHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Извлекаем ID из пути /api/admin/objects/:id
		idStr := r.PathValue("id")
		if idStr == "" {
			http.Error(w, `{"error":"id required"}`, http.StatusBadRequest)
			return
		}

		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
			return
		}

		// PUT — обновление
		if r.Method == http.MethodPut {
			var req objectRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
				return
			}

			// Проверяем, что объект существует
			var exists bool
			pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM objects WHERE id = $1)`, id).Scan(&exists)
			if !exists {
				http.Error(w, `{"error":"object not found"}`, http.StatusNotFound)
				return
			}

			// Обновляем объект
			if req.Name != "" {
				pool.Exec(r.Context(), `UPDATE objects SET name = $1 WHERE id = $2`, req.Name, id)
			}
			if req.IsActive != nil {
				pool.Exec(r.Context(), `UPDATE objects SET is_active = $1 WHERE id = $2`, *req.IsActive, id)
			}

			// Обновляем бирку
			if req.EarTag != "" {
				pool.Exec(r.Context(), `
					UPDATE object_identifiers SET value = $1
					WHERE object_id = $2 AND id_type = 'ear_tag'`, req.EarTag, id)
			}

			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
			return
		}

		// DELETE — удаление (архивирование)
		if r.Method == http.MethodDelete {
			var exists bool
			pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM objects WHERE id = $1)`, id).Scan(&exists)
			if !exists {
				http.Error(w, `{"error":"object not found"}`, http.StatusNotFound)
				return
			}

			pool.Exec(r.Context(), `UPDATE objects SET is_active = false WHERE id = $1`, id)
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"status": "archived"})
			return
		}

		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// ========== Admin: создание пользователей ==========

type adminUser struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedAt string `json:"created_at"`
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func adminUsersHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// POST — создание пользователя
		if r.Method == http.MethodPost {
			var req createUserRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
				return
			}
			if req.Username == "" || req.Password == "" {
				http.Error(w, `{"error":"username and password required"}`, http.StatusBadRequest)
				return
			}
			if req.Role == "" {
				req.Role = "user"
			}
			if req.Role != "admin" && req.Role != "user" && req.Role != "zoo" {
				http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
				return
			}

			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
			if err != nil {
				http.Error(w, `{"error":"password hash error"}`, http.StatusInternalServerError)
				return
			}

			_, err = pool.Exec(r.Context(), `
				INSERT INTO users (name, password, role) VALUES ($1, $2, $3)`,
				req.Username, string(hashedPassword), req.Role)
			if err != nil {
				http.Error(w, `{"error":"db error: "+err.Error()}`, http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"status": "created"})
			return
		}

		// GET — список пользователей
		rows, err := pool.Query(r.Context(), `
			SELECT id, name, role, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI')
			FROM users ORDER BY id`)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		users := []adminUser{}
		for rows.Next() {
			var u adminUser
			if err := rows.Scan(&u.ID, &u.Name, &u.Role, &u.CreatedAt); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			users = append(users, u)
		}
		json.NewEncoder(w).Encode(users)
	}
}

// ========== Zoo: отчёты ==========

type reportMeasurement struct {
	ID          int64     `json:"id"`
	MeasureName string    `json:"measure_name"`
	Value       float64   `json:"value"`
	MeasuredAt  time.Time `json:"measured_at"`
	DeviceID    string    `json:"device_id"`
	AuthorName  string    `json:"author_name"`
}

func reportMeasurementsHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		objectID := r.URL.Query().Get("object_id")
		measureID := r.URL.Query().Get("measure_id")
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")

		if objectID == "" {
			http.Error(w, `{"error":"object_id required"}`, http.StatusBadRequest)
			return
		}

		query := `
			SELECT mv.id, m.name, mv.value, mv.measured_at, mv.device_id, u.name
			FROM measure_values mv
			JOIN measures m ON m.id = mv.measure_id
			LEFT JOIN users u ON u.id = mv.author_id
			WHERE mv.object_id = $1`
		args := []interface{}{objectID}
		argIndex := 2

		if measureID != "" {
			query += fmt.Sprintf(" AND mv.measure_id = $%d", argIndex)
			args = append(args, measureID)
			argIndex++
		}
		if from != "" {
			query += fmt.Sprintf(" AND mv.measured_at >= $%d", argIndex)
			args = append(args, from)
			argIndex++
		}
		if to != "" {
			query += fmt.Sprintf(" AND mv.measured_at <= $%d", argIndex)
			args = append(args, to)
			argIndex++
		}

		query += " ORDER BY mv.measured_at DESC LIMIT 100"

		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		values := []reportMeasurement{}
		for rows.Next() {
			var v reportMeasurement
			if err := rows.Scan(&v.ID, &v.MeasureName, &v.Value, &v.MeasuredAt, &v.DeviceID, &v.AuthorName); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			values = append(values, v)
		}
		json.NewEncoder(w).Encode(values)
	}
}

type summaryStats struct {
	TotalObjects      int64 `json:"total_objects"`
	ActiveObjects     int64 `json:"active_objects"`
	TotalMeasurements int64 `json:"total_measurements"`
	TodayMeasurements int64 `json:"today_measurements"`
}

func summaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var totalObjects, activeObjects, totalMeasurements, todayMeasurements int64

		pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM objects`).Scan(&totalObjects)
		pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM objects WHERE is_active`).Scan(&activeObjects)
		pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM measure_values`).Scan(&totalMeasurements)
		pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM measure_values WHERE measured_at >= CURRENT_DATE`).Scan(&todayMeasurements)

		json.NewEncoder(w).Encode(summaryStats{
			TotalObjects:      totalObjects,
			ActiveObjects:     activeObjects,
			TotalMeasurements: totalMeasurements,
			TodayMeasurements: todayMeasurements,
		})
	}
}
