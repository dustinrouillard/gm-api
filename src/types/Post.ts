export interface Post {
  createdAt: number;
  type: string;
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
