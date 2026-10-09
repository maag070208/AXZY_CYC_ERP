/** Curso (`/courses`, M07). */
export interface Course {
  id: string;
  clave: string;
  nombre: string;
  levelId: string | null;
  levelNombre: string | null;
  descripcion: string | null;
  active: boolean;
  groupsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseInput {
  clave?: string;
  nombre?: string;
  levelId?: string | null;
  descripcion?: string | null;
}

export interface CourseOption {
  id: string;
  clave: string;
  nombre: string;
}
