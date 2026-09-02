package main

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type objectType struct {
	ID        int64  `json:"id"`
	ParentID  *int64 `json:"parent_id"`
	Name      string `json:"name"`
	GroupFlag bool   `json:"group_flag"`
}

func objectTypesHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rows, err := pool.Query(r.Context(), `
			SELECT id, parent_id, name, group_flag
			FROM object_types
			ORDER BY id`)
		if err != nil {
			http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		types := []objectType{}
		for rows.Next() {
			var t objectType
			if err := rows.Scan(&t.ID, &t.ParentID, &t.Name, &t.GroupFlag); err != nil {
				http.Error(w, `{"error":"scan error"}`, http.StatusInternalServerError)
				return
			}
			types = append(types, t)
		}
		json.NewEncoder(w).Encode(types)
	}
}
