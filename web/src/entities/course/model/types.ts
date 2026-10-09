/** Curso (`/courses`, M07). */
export interface Course {
  id: string;
  code: string;
  name: string;
  levelId: string | null;
  levelName: string | null;
  description: string | null;
  active: boolean;
  groupsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseInput {
  code?: string;
  name?: string;
  levelId?: string | null;
  description?: string | null;
}

export interface CourseOption {
  id: string;
  code: string;
  name: string;
}
