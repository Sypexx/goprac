package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func main() {
	// API-роуты
	http.HandleFunc("/api/hello", helloHandler)
	http.HandleFunc("/api/health", healthHandler)

	// Статика фронтенда
	distPath := "../frontend/dist"
	if _, err := os.Stat(distPath); os.IsNotExist(err) {
		log.Println("Frontend dist не найден. Запусти:")
		log.Println("  1. cd frontend && npm install && npm run build")
		log.Println("  2. go run .")
		log.Println("")
		log.Println("Или для dev-режима:")
		log.Println("  1. cd frontend && npm install && npm run dev")
		log.Println("  2. go run . (отдельный терминал)")
	} else {
		http.Handle("/", http.FileServer(http.Dir(distPath)))
	}

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Hello from Go!",
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}
