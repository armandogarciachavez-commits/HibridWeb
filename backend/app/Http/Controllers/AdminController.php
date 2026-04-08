<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    public function indexUsers()
    {
        // Solo socios (excluir admins y superadmins)
        $users = User::with([
            'memberships' => function ($q) {
                $q->orderBy('created_at', 'desc');
            },
            'memberships.createdBy:id,name,username',
            'fingerprints',
            'createdBy:id,name,username',
        ])->where('role', 'socio')->get();

        return response()->json($users);
    }

    public function createUser(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email' => 'nullable|string|email|max:255|unique:users',
            'phone' => 'required|string|max:255',
            'address' => 'required|string',
            'password' => 'required|string|min:6',
            'emergency_contact_name' => 'required|string|max:255',
            'emergency_contact_phone' => 'required|string|max:255',
            'plan_type' => 'nullable|string',
            'photo' => 'nullable|file|extensions:jpg,jpeg,png,webp|max:4096',
            'birthdate' => 'nullable|date',
        ]);

        $adminId = $request->user()?->id;

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => $request->email ?? null,
            'phone' => $request->phone,
            'address' => $request->address,
            'birthdate' => $request->birthdate ?? null,
            'password' => Hash::make($request->password),
            'emergency_contact_name' => $request->emergency_contact_name ?? null,
            'emergency_contact_phone' => $request->emergency_contact_phone ?? null,
            'role' => 'socio',
            'created_by' => $adminId,
        ]);

        if ($request->hasFile('photo')) {
            $user->photo = $request->file('photo')->store('members', 'public');
            $user->save();
        }

        if ($request->filled('plan_type') && $request->plan_type !== 'none') {
            $months = 1;
            if ($request->plan_type === 'anual') $months = 12;
            if ($request->plan_type === 'trimestre') $months = 3;
            if ($request->plan_type === 'bimestre') $months = 2;

            \App\Models\Membership::create([
                'user_id' => $user->id,
                'plan_type' => $request->plan_type,
                'start_date' => now(),
                'end_date' => now()->addMonths($months),
                'is_active' => true,
                'created_by' => $adminId,
            ]);
        }

        $user->photo_url = $user->photo ? \Illuminate\Support\Facades\Storage::url($user->photo) : null;

        return response()->json([
            'message' => 'Socio registrado.',
            'user' => $user
        ], 201);
    }

    public function updateUser(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users,username,'.$id,
            'email' => 'nullable|string|email|max:255|unique:users,email,'.$id,
            'phone' => 'required|string|max:255',
            'address' => 'required|string',
            'emergency_contact_name' => 'required|string|max:255',
            'emergency_contact_phone' => 'required|string|max:255',
            'password' => 'nullable|string|min:6',
            'photo' => 'nullable|file|extensions:jpg,jpeg,png,webp|max:4096',
            'birthdate' => 'nullable|date',
        ]);

        $updateData = [
            'name' => $request->name,
            'username' => $request->username,
            'email' => $request->email ?? null,
            'phone' => $request->phone,
            'address' => $request->address,
            'birthdate' => $request->birthdate ?? null,
            'emergency_contact_name' => $request->emergency_contact_name,
            'emergency_contact_phone' => $request->emergency_contact_phone,
        ];

        if ($request->filled('password')) {
            $updateData['password'] = Hash::make($request->password);
        }
        if ($request->hasFile('photo')) {
            if ($user->photo) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($user->photo);
            }
            $updateData['photo'] = $request->file('photo')->store('members', 'public');
        }

        $user->update($updateData);
        $user->photo_url = $user->photo ? \Illuminate\Support\Facades\Storage::url($user->photo) : null;

        return response()->json([
            'message' => 'Socio actualizado correctamente.',
            'user' => $user
        ]);
    }

    public function deleteUser($id)
    {
        $user = User::findOrFail($id);
        
        // Cascading deletes for associated records
        $user->memberships()->delete();
        $user->fingerprints()->delete();
        $user->scanLogs()->delete();
        
        $user->delete();

        return response()->json(['message' => 'Socio eliminado correctamente.']);
    }

    public function createMembership(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'plan_type' => 'required|string',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date'
        ]);

        $membership = DB::transaction(function () use ($request) {
            // Desactivar las anteriores dentro de la misma transacción
            \App\Models\Membership::where('user_id', $request->user_id)->update(['is_active' => false]);

            return \App\Models\Membership::create([
                'user_id'    => $request->user_id,
                'plan_type'  => $request->plan_type,
                'start_date' => $request->start_date,
                'end_date'   => $request->end_date,
                'is_active'  => true,
                'created_by' => $request->user()?->id,
            ]);
        });

        return response()->json([
            'message' => 'Cobro registrado y membresía activada exitosamente.',
            'membership' => $membership
        ], 201);
    }

    public function indexClassCatalog()
    {
        return response()->json(\App\Models\GymClass::all());
    }

    public function createClassCatalog(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'description' => 'nullable|string',
            'color' => 'nullable|string',
            'default_capacity' => 'required|integer',
            'default_duration_minutes' => 'required|integer',
        ]);
        
        $class = \App\Models\GymClass::create($data);
        return response()->json($class, 201);
    }

    public function deleteClassCatalog($id)
    {
        $gymClass = \App\Models\GymClass::findOrFail($id);
        
        // This will cascade delete any class_sessions due to the foreign key constraint
        $gymClass->delete();

        return response()->json(['message' => 'Clase eliminada del catálogo exitosamente']);
    }

    public function indexSessions(Request $request)
    {
        $month = $request->query('month', date('m'));
        $year = $request->query('year', date('Y'));
        
        $sessions = \App\Models\ClassSession::with('gymClass')
            ->whereMonth('date', $month)
            ->whereYear('date', $year)
            ->orderBy('date')->orderBy('start_time')
            ->get();
            
        return response()->json($sessions);
    }

    public function createSession(Request $request)
    {
        $data = $request->validate([
            'gym_class_id' => 'required|exists:gym_classes,id',
            'instructor' => 'nullable|string',
            'date' => 'required|date',
            'start_time' => 'required',
            'end_time' => 'required',
            'capacity' => 'required|integer',
        ]);
        
        $session = \App\Models\ClassSession::create($data);
        return response()->json($session->load('gymClass'), 201);
    }

    public function generateMonthSessions(Request $request)
    {
        $request->validate([
            'gym_class_id' => 'required|exists:gym_classes,id',
            'instructor' => 'nullable|string',
            'year' => 'required|integer',
            'month' => 'required|integer|min:1|max:12',
            'days_of_week' => 'required|array', // [1, 3] for Mon, Wed
            'start_time' => 'required',
            'end_time' => 'required',
            'capacity' => 'required|integer',
        ]);
        
        $gymClass = \App\Models\GymClass::findOrFail($request->gym_class_id);
        $created = 0;
        
        $daysInMonth = (int) date('t', mktime(0, 0, 0, $request->month, 1, $request->year));
        
        for ($day = 1; $day <= $daysInMonth; $day++) {
            $dateStr = sprintf('%04d-%02d-%02d', $request->year, $request->month, $day);
            $dayOfWeek = date('w', strtotime($dateStr)); // 0 (Sun) to 6 (Sat)
            
            if (in_array((int)$dayOfWeek, $request->days_of_week)) {
                \App\Models\ClassSession::firstOrCreate([
                    'gym_class_id' => $gymClass->id,
                    'date' => $dateStr,
                    'start_time' => $request->start_time,
                ], [
                    'instructor' => $request->instructor,
                    'end_time' => $request->end_time,
                    'capacity' => $request->capacity,
                    'status' => 'scheduled'
                ]);
                $created++;
            }
        }
        
        return response()->json(['message' => "$created sesiones generadas exitosamente."]);
    }

    public function updateSession(Request $request, $id)
    {
        $session = \App\Models\ClassSession::findOrFail($id);
        $data = $request->validate([
            'instructor' => 'sometimes|string',
            'date' => 'sometimes|date',
            'start_time' => 'sometimes',
            'end_time' => 'sometimes',
            'capacity' => 'sometimes|integer',
            'status' => 'sometimes|string',
        ]);
        $session->update($data);
        return response()->json($session->load('gymClass'));
    }

    public function deleteMonthSessions(Request $request)
    {
        $month = $request->query('month');
        $year = $request->query('year');
        if($month && $year){
            \App\Models\ClassSession::whereMonth('date', $month)->whereYear('date', $year)->delete();
            return response()->json(['message' => 'Todas las sesiones del mes eliminadas.']);
        }
        return response()->json(['message' => 'Faltan parámetros.'], 400);
    }

    public function deleteSession($id)
    {
        \App\Models\ClassSession::findOrFail($id)->delete();
        return response()->json(['message' => 'Sesión eliminada.']);
    }

    // ─── Gestión de Administradores (solo superadmin) ─────────────────────────

    public function indexAdmins()
    {
        $admins = \App\Models\User::whereIn('role', ['admin', 'superadmin'])
            ->select('id', 'name', 'username', 'email', 'role', 'created_at')
            ->get();
        return response()->json($admins);
    }

    public function createAdmin(Request $request)
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email'    => 'nullable|email|unique:users',
            'password' => 'required|string|min:6',
            'role'     => 'required|in:admin,superadmin',
        ]);

        $user = \App\Models\User::create([
            'name'     => $data['name'],
            'username' => $data['username'],
            'email'    => $data['email'] ?? null,
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            'role'     => $data['role'],
            'phone'    => '',
            'address'  => '',
        ]);

        return response()->json($user, 201);
    }

    public function deleteAdmin($id)
    {
        $target = \App\Models\User::findOrFail($id);
        $requester = request()->user();

        if ($target->id === $requester->id) {
            return response()->json(['message' => 'No puedes eliminarte a ti mismo.'], 403);
        }

        if (!in_array($target->role, ['admin', 'superadmin'])) {
            return response()->json(['message' => 'El usuario no es administrador.'], 422);
        }

        $target->delete();
        return response()->json(['message' => 'Administrador eliminado.']);
    }

    public function updateAdminRole($id, Request $request)
    {
        $data = $request->validate(['role' => 'required|in:admin,superadmin,socio']);
        $target = \App\Models\User::findOrFail($id);

        if ($target->id === request()->user()->id) {
            return response()->json(['message' => 'No puedes cambiar tu propio rol.'], 403);
        }

        $target->update(['role' => $data['role']]);
        return response()->json($target);
    }
}
