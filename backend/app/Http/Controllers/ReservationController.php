<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\GymClass;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ReservationController extends Controller
{
    // Obtener las clases base con su ocupación por fecha
    public function getClasses(Request $request)
    {
        $date = $request->query('date', date('Y-m-d'));

        // Detectar usuario autenticado si manda token (opcional)
        $userId = null;
        try {
            $userId = auth('sanctum')->id();
        } catch (\Throwable $e) {}

        $sessions = \App\Models\ClassSession::with('gymClass')
            ->whereDate('date', $date)
            ->where('status', 'scheduled')
            ->orderBy('start_time')
            ->get();

        foreach ($sessions as $session) {
            $session->current_bookings = Reservation::where('class_session_id', $session->id)->count();
            $session->user_booked = $userId
                ? Reservation::where('class_session_id', $session->id)->where('user_id', $userId)->exists()
                : false;
        }

        return response()->json($sessions);
    }

    // Clases de todo un mes (público, para landing page)
    public function getClassesByMonth(Request $request)
    {
        $year  = (int) $request->query('year',  date('Y'));
        $month = (int) $request->query('month', date('n'));

        $from = sprintf('%04d-%02d-01', $year, $month);
        $to   = date('Y-m-t', strtotime($from));

        $sessions = \App\Models\ClassSession::with('gymClass')
            ->whereBetween('date', [$from, $to])
            ->where('status', 'scheduled')
            ->orderBy('date')
            ->orderBy('start_time')
            ->get()
            ->map(function ($session) {
                return [
                    'id'               => $session->id,
                    'date'             => $session->date,
                    'start_time'       => substr($session->start_time, 0, 5),
                    'end_time'         => substr($session->end_time,   0, 5),
                    'instructor'       => $session->instructor,
                    'capacity'         => $session->capacity,
                    'current_bookings' => Reservation::where('class_session_id', $session->id)->count(),
                    'name'             => $session->gymClass->name  ?? 'Clase',
                    'color'            => $session->gymClass->color ?? '#00ff88',
                ];
            });

        return response()->json($sessions);
    }

    // Guardar una reservación (Socio)
    public function bookClass(Request $request)
    {
        $request->validate([
            'class_session_id' => 'required|exists:class_sessions,id',
        ]);

        $session = \App\Models\ClassSession::findOrFail($request->class_session_id);

        $user_id = Auth::id();

        // VALIDAR MEMBRESÍA ACTIVA
        $user = User::with(['memberships' => function($q) {
            $q->where('is_active', true)->where('end_date', '>=', now());
        }])->find($user_id);

        if (!$user || $user->memberships->isEmpty()) {
            return response()->json(['message' => 'Tu membresía está inactiva o vencida. Por favor renueva tu plan en el inicio para agendar clases.'], 403);
        }

        // Usar transacción para evitar race conditions en cupo y duplicados
        $reservation = DB::transaction(function () use ($request, $session, $user_id) {
            // Checar cupo dentro de la transacción
            $currentBookings = Reservation::where('class_session_id', $request->class_session_id)
                ->lockForUpdate()->count();

            if ($currentBookings >= $session->capacity) {
                abort(response()->json(['message' => 'La clase está llena'], 400));
            }

            // Verificar si ya tiene reservación idéntica
            $exists = Reservation::where('user_id', $user_id)
                                 ->where('class_session_id', $request->class_session_id)
                                 ->exists();

            if ($exists) {
                abort(response()->json(['message' => 'Ya tienes reservada esta clase'], 400));
            }

            return Reservation::create([
                'user_id' => $user_id,
                'class_session_id' => $request->class_session_id,
                'status' => 'confirmed'
            ]);
        });

        return response()->json(['message' => 'Reserva confirmada', 'reservation' => $reservation->load('classSession.gymClass')], 201);
    }

    // Cancelar una reservación (Socio)
    public function cancelClass(Request $request, $sessionId)
    {
        $userId = Auth::id();

        $reservation = Reservation::where('user_id', $userId)
                                  ->where('class_session_id', $sessionId)
                                  ->first();

        if (!$reservation) {
            return response()->json(['message' => 'No tienes reserva para esta clase'], 404);
        }

        $reservation->delete();

        return response()->json(['message' => 'Reserva cancelada correctamente']);
    }

    // Ver reservaciones (Admin)
    public function getAdminReservations(Request $request)
    {
        $date = $request->query('date'); // opcional: YYYY-MM-DD

        $query = Reservation::with(['user:id,name,username,email', 'classSession.gymClass']);

        if ($date) {
            $query->whereHas('classSession', fn($q) => $q->whereDate('date', $date));
        }

        $reservations = $query->get()
            ->sortBy(function ($res) {
                return $res->classSession ? $res->classSession->date . ' ' . $res->classSession->start_time : '';
            })->values();

        return response()->json($reservations);
    }
}
