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

	// Все авторизованные роуты — добавляем напрямую в mux
	mux.Handle("GET /api/groups", authMiddleware(pool)(groupsHandler(pool)))
	mux.Handle("GET /api/objects", authMiddleware(pool)(objectsHandler(pool)))
	mux.Handle("GET /api/measures", authMiddleware(pool)(measuresHandler(pool)))
	mux.Handle("GET /api/measure-values", authMiddleware(pool)(measureValuesHandler(pool)))
	mux.Handle("POST /api/measure-values", authMiddleware(pool)(createMeasureValueHandler(pool)))
	mux.Handle("POST /api/sync", authMiddleware(pool)(syncHandler(pool)))
	mux.Handle("GET /api/object-types", authMiddleware(pool)(objectTypesHandler(pool)))
	mux.Handle("GET /api/admin/objects", authMiddleware(pool)(requireRole("admin")(adminObjectsHandler(pool))))
	mux.Handle("POST /api/admin/objects", authMiddleware(pool)(requireRole("admin")(adminObjectsHandler(pool))))
	mux.Handle("/api/admin/objects/{id}", authMiddleware(pool)(requireRole("admin")(adminObjectHandler(pool))))
	mux.Handle("GET /api/admin/users", authMiddleware(pool)(requireRole("admin")(adminUsersHandler(pool))))
	mux.Handle("POST /api/admin/users", authMiddleware(pool)(requireRole("admin")(adminUsersHandler(pool))))
	mux.Handle("GET /api/admin/measures", authMiddleware(pool)(requireRole("admin")(measuresAdminHandler(pool))))
	mux.Handle("POST /api/admin/measures", authMiddleware(pool)(requireRole("admin")(measuresAdminHandler(pool))))
	mux.Handle("GET /api/reports/measurements", authMiddleware(pool)(requireRole("admin", "zoo")(reportMeasurementsHandler(pool))))
	mux.Handle("GET /api/reports/summary", authMiddleware(pool)(requireRole("admin", "zoo")(summaryHandler(pool))))

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
