// Общие типы приложения (соответствуют JSON API бэкенда)

export interface Animal {
  id: number
  object_type_id: number
  object_type_name: string
  name: string
  ear_tag: string
}

export interface Measure {
  id: number
  name: string
  unit: string
  measure_type: string
}

export interface MeasureValue {
  id: number
  measure_name: string
  unit: string
  value: number
  measured_at: string
  device_id: string
}

export interface QueuedValue {
  client_uuid: string
  measure_id: number
  object_id: number
  value: number
  measured_at: string
  device_id: string
}

export interface User {
  username: string
  role: 'admin' | 'user' | 'zoo'
  token: string
}

export interface ReportMeasurement {
  id: number
  measure_name: string
  value: number
  measured_at: string
  device_id: string
  author_name: string
}

export interface AdminObject {
  id: number
  object_type_id: number
  object_type_name: string
  parent_id: number | null
  parent_name: string
  name: string
  ear_tag: string
  is_active: boolean
  created_at: string
}

export interface AdminUser {
  id: number
  name: string
  role: string
  created_at: string
}

export interface SummaryStats {
  total_objects: number
  active_objects: number
  total_measurements: number
  today_measurements: number
}

export interface ObjectType {
  id: number
  parent_id: number | null
  name: string
  group_flag: boolean
}

// Узел дерева объектов (объект + ссылка на родителя)
export interface TreeNode extends Animal {
  parent_id: number | null
  parent_name: string
}

// Заголовки для авторизованных запросов
export function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Auth-Token': token }
}
