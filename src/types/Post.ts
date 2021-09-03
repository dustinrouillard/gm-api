export interface Post {
  id: string;
  createdAt: number;
  type: string;
  text: string;
  creator: Creator;
  updatedAt: number;
}

export interface Creator {
  avatarUrl: string;
  gmScore: number;
  uid: string;
  username: string;
  name: string;
  bio: string;
}
