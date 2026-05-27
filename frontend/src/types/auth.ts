export interface SessionUser {
  id?: number
  employee_id?: string
  employee_number?: string
  username?: string
  email?: string
  auth?: 'ENGINEER' | 'ADMIN'
}

export interface SessionResponse {
  authenticated: boolean
  user: SessionUser | null
}
