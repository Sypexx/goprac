package main

import (
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

	// Открытые роуты
	mux.HandleFunc("GET /api/health", healthHandler)
	mux.HandleFunc("POST /api/login", loginHandler(pool))

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
	w.Write([]byte(`{"status":"ok"}`))
}
