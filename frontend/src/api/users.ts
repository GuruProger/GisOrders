import { apiRequest } from './client'

/** Public profile returned for users other than yourself or an admin. */
export interface PublicUser {
  id: number
  username: string
}

/** Other users' public profiles expose only the id and username. */
export async function fetchUser(id: number): Promise<PublicUser> {
  const { data } = await apiRequest<PublicUser>(`/users/${id}`)
  return data
}
