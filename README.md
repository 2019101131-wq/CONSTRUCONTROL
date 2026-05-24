# CONSTRUCONTROL — Sistema Industrial de Control de Obras

Sistema web profesional para gestión integral de obras de construcción: presupuesto, materiales, pagos, desviaciones y análisis financiero en tiempo real.

---

## 🚀 DESPLIEGUE EN GITHUB PAGES (5 minutos)

### Paso 1: Subir a GitHub
1. Crea un nuevo repositorio en [github.com](https://github.com/new)  
2. Sube los 3 archivos: `index.html`, `style.css`, `app.js`
3. Ve a **Settings → Pages → Branch: main → Save**
4. Tu sistema estará en: `https://tu-usuario.github.io/tu-repositorio`

---

## 🗄 CONFIGURAR BASE DE DATOS (JSONBin.io)

El sistema usa **JSONBin.io** como base de datos REST gratuita y persistente.

### Paso 1: Crear cuenta gratuita
1. Regístrate en [jsonbin.io](https://jsonbin.io)
2. Verifica tu email

### Paso 2: Obtener API Key
1. Ve a **Account Settings → API Keys**
2. Copia tu **Master Key** (empieza con `$2b$10$...`)

### Paso 3: Crear un BIN
1. Ve a **Bins → + Create Bin**
2. Pega este JSON inicial: `{}`
3. Haz clic en **Create Bin**
4. Copia el **BIN ID** del URL (ej: `64a1b2c3d4e5f6a7b8c9d0e1`)

### Paso 4: Configurar el sistema
1. Abre el sistema
2. Haz clic en **⚙ CONFIGURAR BD**
3. Ingresa tu **API Key** y **BIN ID**
4. Ingresa el nombre de la obra
5. Haz clic en **GUARDAR Y CONECTAR**

✅ ¡Listo! Los datos se sincronizarán automáticamente entre todos los dispositivos.

---

## 📋 MÓDULOS DEL SISTEMA

| Módulo | Descripción |
|--------|-------------|
| **Dashboard General** | KPIs, gráficos, alertas automáticas en tiempo real |
| **Cronograma de Pagos** | Registro y seguimiento de pagos por etapa |
| **Gastos Adicionales** | Control de gastos extras y pagos parciales |
| **Despacho de Materiales** | Registro de todos los materiales utilizados |
| **Balance de Materiales** | Resumen automático agrupado por material |
| **Presupuesto de Materiales** | Estándar presupuestado por piso/etapa/categoría |
| **Análisis de Desviaciones** | Comparación estándar vs real con % de desviación |
| **Control Sobre/Sub Estándar** | Indicadores de eficiencia con semáforos |

---

## 🛠 TECNOLOGÍAS

- **HTML5 / CSS3 / JavaScript ES6+** — Sin frameworks
- **JSONBin.io** — Base de datos REST gratuita y persistente
- **Chart.js 4.4** — Gráficos interactivos
- **SheetJS (xlsx)** — Exportación a Excel
- **IBM Plex Sans + IBM Plex Mono** — Tipografía industrial

---

## 📁 ARCHIVOS

```
construcontrol/
├── index.html    ← Estructura HTML con todos los módulos y modales
├── style.css     ← Diseño industrial (SAP/Power BI inspired)
├── app.js        ← Lógica CRUD + sync JSONBin + cálculos + charts
└── README.md     ← Este archivo
```

---

## ⚠ NOTAS IMPORTANTES

- **Los datos son persistentes**: nunca se borran solos
- **Multiusuario**: accede desde cualquier PC con internet
- **Exportación Excel**: disponible en todos los módulos
- **Sin frameworks**: solo HTML + CSS + JS puro
- **Sin PHP/MySQL**: arquitectura serverless con JSONBin.io

---

*CONSTRUCONTROL v2.0 — Sistema Industrial de Control de Obras*
