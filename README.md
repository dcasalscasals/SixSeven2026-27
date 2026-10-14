# SIX SEVEN · Liga FPIB

Panel para consultar los resultados de todos los enfrentamientos de la División Azul Masculina, las actas con resultados de las tres parejas, la clasificación y estadísticas de jugadores y parejas en la Liga FPIB 26/27 (Menorca).

## Despliegue en Vercel

1. Sube estos archivos a un repositorio Git (GitHub, GitLab o Bitbucket).
2. En Vercel, elige **Add New → Project** e importa ese repositorio.
3. Mantén la configuración por defecto y selecciona **Deploy**. No hacen falta variables de entorno.

La página usa una función de Vercel en `/api/data` que lee la clasificación, todas las jornadas y las actas publicadas de los enfrentamientos. La vista separa los resultados por jornada e incluye victorias, derrotas, sets y las parejas de jugadores que se repiten por equipo. Vercel conserva la respuesta en caché durante cinco minutos.

## Datos consultados

- Liga: `28876`
- Grupo: `32942` (División Azul Masculina)
- Equipo: `161338` (SIX SEVEN)
- [Clasificación oficial](https://www.padelfederacion.es/Paginas/fpadelib/Ligas_Clasificacion.asp?Liga=28876&grupo=32942)
- [Calendario oficial](https://www.padelfederacion.es/Paginas/fpadelib/Ligas_Calendario.asp?grupo=32942&Liga=28876)
