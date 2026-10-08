// Valores descartables para el runner unitario: `env.config.ts` exige estas
// variables al importarse. Se importa ANTES que los módulos bajo prueba para
// garantizar que estén definidas (además de los defaults del config de Playwright).
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.DATABASE_URL ??= "postgresql://cyc:cyc@localhost:5432/cyc_test?schema=public";
process.env.JWT_SECRET ??= "unit-test-secret";
process.env.JWT_EXPIRES_IN ??= "7d";
process.env.JWT_REFRESH_EXPIRES_IN ??= "30d";
