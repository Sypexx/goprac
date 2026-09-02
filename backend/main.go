package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"demo/app-1/db"
)

func main() {
	// Подключение к PostgreSQL
	pool := db.Connect()
	defer pool.Close()

	if err := db.Migrate(pool); err != nil {
		log.Fatalf("failed to migrate: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", healthHandler)
	mux.HandleFunc("GET /api/groups", groupsHandler(pool))
	mux.HandleFunc("GET /api/objects", objectsHandler(pool))
	mux.HandleFunc("GET /api/measures", measuresHandler(pool))
	mux.HandleFunc("GET /api/measure-values", measureValuesHandler(pool))
	mux.HandleFunc("POST /api/measure-values", createMeasureValueHandler(pool))
	mux.HandleFunc("POST /api/sync", syncHandler(pool))

	// Статика фронтенда
	distPath := "../frontend/dist"
	if _, err := os.Stat(distPath); os.IsNotExist(err) {
		log.Println("Frontend dist не найден. Для dev-режима: cd frontend && npm run dev")
	} else {
		mux.Handle("/", http.FileServer(http.Dir(distPath)))
	}

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
