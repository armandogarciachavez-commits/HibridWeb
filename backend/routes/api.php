<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\BiometricController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\ReservationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\AnnouncementController;
use App\Http\Controllers\AccountingController;
use App\Http\Controllers\AccountingConceptController;
use App\Http\Controllers\ProductController;

// ─── Rutas públicas ───────────────────────────────────────────────────────────
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::get('/classes', [ReservationController::class, 'getClasses']);
Route::get('/classes/month', [ReservationController::class, 'getClassesByMonth']);
Route::get('/catalog', fn() => response()->json(\App\Models\GymClass::all()));
Route::post('/payments/webhook', [PaymentController::class, 'webhook']);

// ─── Socio autenticado ────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user()->load('memberships');
    });
    Route::post('/reservations/book', [ReservationController::class, 'bookClass']);
    Route::delete('/reservations/cancel/{sessionId}', [ReservationController::class, 'cancelClass']);
    Route::post('/payments/create-preference', [PaymentController::class, 'createPreference']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/announcements', [AnnouncementController::class, 'index']);
});

// ─── Administrador (admin + superadmin) ───────────────────────────────────────
Route::middleware(['auth:sanctum', 'admin'])->group(function () {
    // Socios
    Route::get('/admin/users', [AdminController::class, 'indexUsers']);
    Route::post('/admin/users', [AdminController::class, 'createUser']);
    Route::put('/admin/users/{id}', [AdminController::class, 'updateUser']);
    Route::delete('/admin/users/{id}', [AdminController::class, 'deleteUser']);
    Route::post('/admin/memberships', [AdminController::class, 'createMembership']);

    // Catálogo de clases
    Route::get('/admin/classes/catalog', [AdminController::class, 'indexClassCatalog']);
    Route::post('/admin/classes/catalog', [AdminController::class, 'createClassCatalog']);
    Route::delete('/admin/classes/catalog/{id}', [AdminController::class, 'deleteClassCatalog']);

    // Calendario
    Route::get('/admin/calendar/sessions', [AdminController::class, 'indexSessions']);
    Route::post('/admin/calendar/sessions', [AdminController::class, 'createSession']);
    Route::put('/admin/calendar/sessions/{id}', [AdminController::class, 'updateSession']);
    Route::delete('/admin/calendar/sessions/{id}', [AdminController::class, 'deleteSession']);
    Route::delete('/admin/calendar/month', [AdminController::class, 'deleteMonthSessions']);
    Route::post('/admin/calendar/generate', [AdminController::class, 'generateMonthSessions']);

    // Reservaciones
    Route::get('/admin/reservations', [ReservationController::class, 'getAdminReservations']);

    // Biométrica
    Route::post('/biometric/enroll', [BiometricController::class, 'enroll']);
    Route::post('/biometric/verify', [BiometricController::class, 'verify']);
    Route::get('/admin/scans/recent', [BiometricController::class, 'getRecentScan']);
    Route::get('/biometric/templates', [BiometricController::class, 'getTemplates']);

    // Anuncios (admin)
    Route::get('/admin/announcements', [AnnouncementController::class, 'adminIndex']);
    Route::post('/admin/announcements', [AnnouncementController::class, 'store']);
    Route::put('/admin/announcements/{id}', [AnnouncementController::class, 'update']);
    Route::patch('/admin/announcements/{id}/toggle', [AnnouncementController::class, 'toggle']);
    Route::delete('/admin/announcements/{id}', [AnnouncementController::class, 'destroy']);
});

    // Contabilidad — Entradas
    Route::get('/admin/accounting/today',               [AccountingController::class, 'indexToday']);
    Route::post('/admin/accounting/entries',            [AccountingController::class, 'store']);
    Route::delete('/admin/accounting/entries/{id}',     [AccountingController::class, 'destroy']);
    Route::get('/admin/accounting/report',              [AccountingController::class, 'report']);

    // Contabilidad — Conceptos
    Route::get('/admin/accounting/concepts',            [AccountingConceptController::class, 'index']);
    Route::post('/admin/accounting/concepts',           [AccountingConceptController::class, 'store']);
    Route::put('/admin/accounting/concepts/{id}',       [AccountingConceptController::class, 'update']);
    Route::delete('/admin/accounting/concepts/{id}',    [AccountingConceptController::class, 'destroy']);

    // Inventario de Productos
    Route::get('/admin/products',                       [ProductController::class, 'index']);
    Route::post('/admin/products',                      [ProductController::class, 'store']);
    Route::put('/admin/products/{id}',                  [ProductController::class, 'update']);
    Route::delete('/admin/products/{id}',               [ProductController::class, 'destroy']);
    Route::patch('/admin/products/{id}/stock',          [ProductController::class, 'adjustStock']);

// ─── Super Administrador ──────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'superadmin'])->group(function () {
    Route::get('/superadmin/admins', [AdminController::class, 'indexAdmins']);
    Route::post('/superadmin/admins', [AdminController::class, 'createAdmin']);
    Route::delete('/superadmin/admins/{id}', [AdminController::class, 'deleteAdmin']);
    Route::put('/superadmin/admins/{id}/role', [AdminController::class, 'updateAdminRole']);
});
