package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type scan struct {
	TagID     string    `json:"tag_id"`
	DeviceID  string    `json:"device_id"`
	ScannedAt time.Time `json:"scanned_at"`
}

// scansHandler — приём одного скана (POST) и список последних сканов (GET).
func scansHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.Method {
		case http.MethodPost:
			var s scan
			if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
				http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
				return
			}
			if s.ScannedAt.IsZero() {
				s.ScannedAt = time.Now()
			}
			if s.DeviceID == "" {
				s.DeviceID = "unknown"
			}

			_, err := pool.Exec(r.Context(),
				`INSERT INTO scans (tag_id, device_id, scanned_at) VALUES ($1, $2, $3)`,
				s.TagID, s.DeviceID, s.ScannedAt)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"status": "created"})

		case http.MethodGet:
			rows, err := pool.Query(r.Context(),
				`SELECT tag_id, device_id, scanned_at FROM scans ORDER BY scanned_at DESC LIMIT 100`)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			scans := []scan{}
			for rows.Next() {
				var s scan
				if err := rows.Scan(&s.TagID, &s.DeviceID, &s.ScannedAt); err != nil {
					http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
					return
				}
				scans = append(scans, s)
			}
			json.NewEncoder(w).Encode(scans)

		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	}
}

type syncRequest struct {
	Scans []scan `json:"scans"`
}

type syncResponse struct {
	Inserted int `json:"inserted"`
}

// syncHandler — пакетная выгрузка оффлайн-данных с устройства.
func syncHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var req syncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}

		inserted := 0
		for _, s := range req.Scans {
			if s.ScannedAt.IsZero() {
				s.ScannedAt = time.Now()
			}
			if s.DeviceID == "" {
				s.DeviceID = "unknown"
			}
			_, err := pool.Exec(r.Context(),
				`INSERT INTO scans (tag_id, device_id, scanned_at) VALUES ($1, $2, $3)`,
				s.TagID, s.DeviceID, s.ScannedAt)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			inserted++
		}

		json.NewEncoder(w).Encode(syncResponse{Inserted: inserted})
	}
}
