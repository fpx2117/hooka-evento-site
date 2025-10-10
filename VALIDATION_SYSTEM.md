# Sistema de Validación de Entradas con QR

## Resumen

Sistema completo de validación de entradas mediante códigos QR que permite al personal de seguridad escanear entradas usando la cámara del celular desde una URL pública.

## URL Pública de Validación

**URL:** `https://tu-dominio.com/validate`

Esta página es pública y no requiere autenticación, diseñada específicamente para el personal de seguridad.

## Características

### 1. Escaneo con Cámara
- Usa la cámara del celular para escanear códigos QR
- Funciona en cualquier dispositivo móvil con cámara
- No requiere aplicación adicional, solo un navegador web

### 2. Información Mostrada
Al escanear un QR válido, se muestra:
- **Nombre completo** de la persona
- **DNI** para verificación de identidad
- **Tipo de entrada:**
  - Entrada General (Hombre/Mujer)
  - Mesa VIP (Standard/Premium/Deluxe)
- **Ubicación** (solo para mesas VIP): Cerca de la Piscina o Cerca del DJ
- **Cantidad de invitados** (solo para mesas VIP)
- **Fecha del evento**

### 3. Validación Automática
- Al escanear, la entrada se marca automáticamente como validada en la base de datos
- Si se intenta escanear nuevamente, muestra que ya fue validada con fecha y hora
- Previene entrada duplicada

### 4. Sincronización con Mercado Pago
- Solo se pueden validar entradas con pago confirmado (status: "approved")
- El sistema verifica el estado del pago antes de permitir la validación
- Los datos del QR se generan automáticamente al confirmar el pago

## Flujo de Compra y Validación

### Compra de Entrada
1. Usuario completa formulario con:
   - Nombre completo
   - DNI
   - Email
   - Teléfono
   - Género (para entradas generales)
2. Realiza pago con Mercado Pago
3. Al confirmar pago, recibe email con código QR único

### Validación en el Evento
1. Personal de seguridad accede a `/validate`
2. Presiona "Escanear QR"
3. Apunta la cámara al código QR del cliente
4. Sistema muestra información y valida automáticamente
5. Si ya fue validado, muestra alerta de entrada duplicada

## Campos Requeridos en Formularios

### Entrada General
- Nombre completo
- DNI ✨ (nuevo)
- Email
- Género (Hombre/Mujer)
- Teléfono

### Mesa VIP
- Nombre completo
- DNI ✨ (nuevo)
- Email
- Teléfono
- Cantidad de invitados
- Ubicación preferida (Piscina/DJ)
- Fecha de reserva

## Base de Datos

### Tabla: Ticket
\`\`\`sql
- customerDni: String (DNI del comprador)
- validated: Boolean (si ya fue validado)
- validatedAt: DateTime (cuándo fue validado)
- paymentStatus: String (pending/approved/rejected)
\`\`\`

### Tabla: TableReservation
\`\`\`sql
- customerDni: String (DNI del comprador)
- validated: Boolean (si ya fue validado)
- validatedAt: DateTime (cuándo fue validado)
- paymentStatus: String (pending/approved/rejected)
\`\`\`

## Seguridad

- Solo se validan entradas con pago confirmado
- Cada QR es único e irrepetible
- La validación se registra con timestamp
- No se puede validar dos veces la misma entrada

## Instrucciones para Personal de Seguridad

1. Abrir en el celular: `https://tu-dominio.com/validate`
2. Presionar "Escanear QR"
3. Permitir acceso a la cámara cuando lo solicite
4. Apuntar la cámara al código QR del cliente
5. Verificar que el nombre y DNI coincidan con el documento
6. Si aparece ✅ verde: Entrada válida, dejar pasar
7. Si aparece ❌ rojo: Entrada ya usada o inválida, no dejar pasar

## Notas Importantes

- La URL `/validate` es pública y accesible sin login
- El panel admin (`/admin/dashboard`) sigue requiriendo autenticación
- Los QR se generan automáticamente al confirmar el pago
- El sistema funciona offline una vez cargada la página (requiere conexión para validar)
