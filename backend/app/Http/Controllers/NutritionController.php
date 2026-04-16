<?php
namespace App\Http\Controllers;

use App\Models\NutritionAppointment;
use App\Models\User;
use Illuminate\Http\Request;
use Carbon\Carbon;

class NutritionController extends Controller
{
    // ── Admin: all appointments with optional filters ──────────────────────
    public function index(Request $request)
    {
        $q = NutritionAppointment::with('user:id,name,email,phone,photo')
            ->orderBy('date')->orderBy('start_time');

        if ($request->date)   $q->whereDate('date', $request->date);
        if ($request->month)  $q->whereMonth('date', $request->month)
                                ->whereYear('date', $request->year ?? now()->year);
        if ($request->status) $q->where('status', $request->status);
        if ($request->user_id) $q->where('user_id', $request->user_id);

        return response()->json($q->get());
    }

    // ── Socio: own appointments ───────────────────────────────────────────
    public function myAppointments(Request $request)
    {
        $appts = NutritionAppointment::where('user_id', $request->user()->id)
            ->orderByDesc('date')->orderBy('start_time')
            ->get(['id','date','start_time','end_time','status','notes']);
        return response()->json($appts);
    }

    // ── Available time slots for a date ───────────────────────────────────
    public function available(Request $request)
    {
        $request->validate(['date' => 'required|date']);
        $date = $request->date;

        // Working hours: 9:00 - 19:00, 1h slots
        $slots = [];
        $start = Carbon::parse($date . ' 09:00');
        $end   = Carbon::parse($date . ' 19:00');
        while ($start < $end) {
            $slots[] = [
                'start' => $start->format('H:i'),
                'end'   => $start->copy()->addHour()->format('H:i'),
            ];
            $start->addHour();
        }

        // Remove booked slots
        $booked = NutritionAppointment::where('date', $date)
            ->whereNotIn('status', ['cancelled'])
            ->get(['start_time','end_time']);

        $available = array_filter($slots, function($slot) use ($booked) {
            foreach ($booked as $b) {
                $bS = substr($b->start_time, 0, 5);
                $bE = substr($b->end_time, 0, 5);
                // overlap: slot starts before booked ends AND slot ends after booked starts
                if ($slot['start'] < $bE && $slot['end'] > $bS) return false;
            }
            return true;
        });

        return response()->json(array_values($available));
    }

    // ── Create appointment (admin or socio) ───────────────────────────────
    public function store(Request $request)
    {
        $isAdmin = in_array($request->user()->role, ['admin','superadmin']);

        $data = $request->validate([
            'user_id'    => $isAdmin ? 'required|exists:users,id' : 'nullable',
            'date'       => 'required|date|after_or_equal:today',
            'start_time' => 'required|date_format:H:i',
            'notes'      => 'nullable|string|max:500',
            'admin_notes'=> 'nullable|string|max:500',
        ]);

        // Socios always book for themselves
        if (!$isAdmin) $data['user_id'] = $request->user()->id;

        // Calculate end_time (1h consultation)
        $data['end_time'] = Carbon::parse($data['date'].' '.$data['start_time'])
            ->addHour()->format('H:i');

        // Overlap check
        $overlap = NutritionAppointment::where('date', $data['date'])
            ->whereNotIn('status', ['cancelled'])
            ->where(function($q) use ($data) {
                $q->where(function($q2) use ($data) {
                    $q2->where('start_time', '<', $data['end_time'])
                       ->where('end_time',   '>', $data['start_time']);
                });
            })->exists();

        if ($overlap) {
            return response()->json([
                'message' => 'Ese horario ya está ocupado. Por favor elige otro.'
            ], 422);
        }

        $data['status']     = $isAdmin ? 'confirmed' : 'scheduled';
        $data['created_by'] = $request->user()->id;

        $appt = NutritionAppointment::create($data);
        return response()->json($appt->load('user:id,name,email,phone'), 201);
    }

    // ── Update appointment (admin) ─────────────────────────────────────────
    public function update(Request $request, $id)
    {
        $appt = NutritionAppointment::findOrFail($id);

        $data = $request->validate([
            'date'       => 'sometimes|date',
            'start_time' => 'sometimes|date_format:H:i',
            'status'     => 'sometimes|in:scheduled,confirmed,completed,cancelled',
            'notes'      => 'nullable|string|max:500',
            'admin_notes'=> 'nullable|string|max:500',
        ]);

        // Recalculate end_time if date/start_time changed
        $newDate  = $data['date']       ?? $appt->date->format('Y-m-d');
        $newStart = $data['start_time'] ?? substr($appt->start_time, 0, 5);
        if (isset($data['date']) || isset($data['start_time'])) {
            $data['end_time'] = Carbon::parse($newDate.' '.$newStart)->addHour()->format('H:i');

            // Overlap check (exclude self)
            $overlap = NutritionAppointment::where('date', $newDate)
                ->where('id', '!=', $id)
                ->whereNotIn('status', ['cancelled'])
                ->where(function($q) use ($newStart, $data) {
                    $q->where('start_time', '<', $data['end_time'])
                      ->where('end_time',   '>', $newStart);
                })->exists();

            if ($overlap) {
                return response()->json([
                    'message' => 'Ese horario ya está ocupado.'
                ], 422);
            }
        }

        $appt->update($data);
        return response()->json($appt->load('user:id,name,email,phone'));
    }

    // ── Cancel (socio can cancel own; admin can cancel any) ───────────────
    public function destroy(Request $request, $id)
    {
        $appt = NutritionAppointment::findOrFail($id);
        $isAdmin = in_array($request->user()->role, ['admin','superadmin']);

        if (!$isAdmin && $appt->user_id !== $request->user()->id) {
            return response()->json(['message' => 'No autorizado.'], 403);
        }

        $appt->update(['status' => 'cancelled']);
        return response()->json(['message' => 'Cita cancelada.']);
    }
}
