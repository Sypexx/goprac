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

	// Авторизованные роуты (через middleware)
	authRouter := http.NewServeMux()

	// Группы, объекты, показатели — для всех авторизованных
	authRouter.Handle("GET /api/groups", authMiddleware(pool)(groupsHandler(pool)))
	authRouter.Handle("GET /api/objects", authMiddleware(pool)(objectsHandler(pool)))
	authRouter.Handle("GET /api/measures", authMiddleware(pool)(measuresHandler(pool)))
	authRouter.Handle("GET /api/measure-values", authMiddleware(pool)(measureValuesHandler(pool)))
	authRouter.Handle("POST /api/measure-values", authMiddleware(pool)(createMeasureValueHandler(pool)))
	authRouter.Handle("POST /api/sync", authMiddleware(pool)(syncHandler(pool)))
	authRouter.Handle("GET /api/object-types", authMiddleware(pool)(objectTypesHandler(pool)))

	// Админка — только для admin
	adminRouter := http.NewServeMux()
	adminRouter.Handle("GET /api/admin/objects", authMiddleware(pool)(requireRole("admin")(adminObjectsHandler(pool))))
	adminRouter.Handle("/api/admin/objects/{id}", authMiddleware(pool)(requireRole("admin")(adminObjectHandler(pool))))
	adminRouter.Handle("GET /api/admin/users", authMiddleware(pool)(requireRole("admin")(adminUsersHandler(pool))))

	// Зоотехник — для admin и zoo
	zooRouter := http.NewServeMux()
	zooRouter.Handle("GET /api/reports/measurements", authMiddleware(pool)(requireRole("admin", "zoo")(reportMeasurementsHandler(pool))))
	zooRouter.Handle("GET /api/reports/summary", authMiddleware(pool)(requireRole("admin", "zoo")(summaryHandler(pool))))

	// Подключаем маршруты
	mux.Handle("/api/auth/", authRouter)
	mux.Handle("/api/admin/", adminRouter)
	mux.Handle("/api/reports/", zooRouter)

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
