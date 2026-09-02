package main

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ========== Admin: управление показателями ==========

type measureAdmin struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	DataType    string `json:"data_type"`
	Unit        string `json:"unit"`
	MeasureType string `json:"measure_type"`
}

type createMeasureRequest struct {
	Name        string `json:"name"`
	DataType    string `json:"data_type"`
	Unit        string `json:"unit"`
	MeasureType string `json:"measure_type"`
	TypeIDs     []int64 `json:"type_ids"`
}

func measuresAdminHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// GET — список всех показателей
		if r.Method == http.MethodGet {
			rows, err := pool.Query(r.Context(), `
				SELECT id, name, data_type, COALESCE(unit, ''), measure_type
				FROM measures ORDER BY id`)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			measures := []measureAdmin{}
			for rows.Next() {
				var m measureAdmin
				if err := rows.Scan(&m.ID, &m.Name, &m.DataType, &m.Unit, &m.MeasureType); err != nil {
					http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
					return
				}
				measures = append(measures, m)
			}
			json.NewEncoder(w).Encode(measures)
			return
		}

		// POST — создание показателя
		if r.Method == http.MethodPost {
			var req createMeasureRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
				return
			}
			if req.DataType == "" {
				req.DataType = "numeric"
			}
			if req.MeasureType == "" {
				req.MeasureType = "instant"
			}

			res, err := pool.Exec(r.Context(), `
				INSERT INTO measures (name, data_type, unit, measure_type)
				VALUES ($1, $2, $3, $4)
				RETURNING id`,
				req.Name, req.DataType, req.Unit, req.MeasureType)
			if err != nil {
				http.Error(w, `{"error":"db error: "+err.Error()}`, http.StatusInternalServerError)
				return
			}

			measureID := res.RowsAffected()

			// Привязка к типам объектов
			for _, typeID := range req.TypeIDs {
				pool.Exec(r.Context(), `
					INSERT INTO measure_to_object_type (measure_id, object_type_id)
					VALUES ($1, $2)
					ON CONFLICT DO NOTHING`, measureID, typeID)
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]int64{"id": measureID})
			return
		}

		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}
