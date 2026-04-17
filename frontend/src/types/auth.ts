export interface AuthUser {
  id: number
  employee_id: string
  employee_number: string
  username: string
  email: string
  auth: 'ENGINEER' | 'ADMIN'
}

export interface AuthSessionResponse {
  authenticated: boolean
  user?: AuthUser
}
