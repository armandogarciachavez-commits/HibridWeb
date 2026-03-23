<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Membership;
use App\Models\GymClass;
use App\Models\ClassSession;
use App\Models\Reservation;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

echo "Iniciando inyección de datos de prueba en Producción...\n";

// 1. Crear 15 Socios Falsos (Nombres Mexicanos)
$names = [
    'Alejandro Fernández', 'María José López', 'Carlos Santana', 'Ana Gabriel Gómez', 
    'Luis Miguel Pérez', 'Thalía Basteri', 'Vicente Ramírez', 'Paulina Rubio', 
    'Emanuel Mijares', 'Lucero Hogaza', 'Cristian Castro', 'Yuri Espinoza', 
    'Pepe Aguilar', 'Gloria Trevi', 'Ricky Martin'
];

$users = [];
foreach ($names as $i => $name) {
    $emailParts = explode(' ', strtolower($name));
    $username = $emailParts[0] . rand(10,99);
    $email = $username . '@correo.com';

    $user = User::firstOrCreate(
        ['email' => $email],
        [
            'name' => $name,
            'username' => $username,
            'password' => Hash::make('password123'),
            'role' => 'socio',
            'phone' => '55' . rand(10000000, 99999999),
            'address' => 'CDMX Centro, Calle ' . rand(1, 100),
            'emergency_contact_name' => 'Familiar de ' . $emailParts[0],
            'emergency_contact_phone' => '55' . rand(10000000, 99999999),
            'created_by' => 1
        ]
    );

    // Agregar membresía activa
    Membership::firstOrCreate(
        ['user_id' => $user->id, 'is_active' => true],
        [
            'plan_type' => 'mensual',
            'start_date' => Carbon::now()->subDays(rand(1, 20)),
            'end_date' => Carbon::now()->addDays(rand(10, 30)),
            'created_by' => 1
        ]
    );

    $users[] = $user;
}
echo "✓ 15 Socios de prueba generados.\n";

// 2. Traer el catálogo base
$catalog = GymClass::all();
if ($catalog->count() === 0) {
    echo "❌ Error: El Catálogo Base está vacío. Genera las 5 clases base primero.\n";
    exit;
}

// 3. Generar la agenda de esta semana (Lunes a Sábado) si no existe
$startDate = Carbon::now()->startOfWeek(); // Lunes de esta semana
$endDate = Carbon::now()->endOfWeek()->subDay(); // Sábado de esta semana

$trainers = ['Alex', 'Ithzel', 'Gil', 'Vanessa', 'Alan', 'Adriana'];

// Vaciamos sesiones viejas de prueba (opcional, pero mejor no tocar si ya hay)
// Solo generamos si hay menos de 10 sesiones en la base de datos
if (ClassSession::count() < 10) {
    echo "Generando agenda para la semana en curso...\n";
    
    for ($date = $startDate->copy(); $date->lte($endDate); $date->addDay()) {
        $dayOfWeek = $date->dayOfWeek; // 1 = Lunes, 6 = Sábado
        
        // 3 clases en la mañana, 3 en la tarde
        $times = ['06:00:00', '07:00:00', '08:00:00', '18:00:00', '19:00:00', '20:00:00'];
        if ($dayOfWeek == 6) {
            $times = ['09:00:00', '10:00:00']; // Sábado solo mañana
        }

        foreach ($times as $time) {
            $template = $catalog->random();
            $start = Carbon::parse($time);
            $end = $start->copy()->addMinutes($template->default_duration_minutes ?? 60);

            ClassSession::firstOrCreate([
                'gym_class_id' => $template->id,
                'date' => $date->format('Y-m-d'),
                'start_time' => $start->format('H:i:s'),
            ], [
                'instructor' => $trainers[array_rand($trainers)],
                'end_time' => $end->format('H:i:s'),
                'capacity' => $template->default_capacity ?? 15,
                'status' => 'scheduled'
            ]);
        }
    }
    echo "✓ Calendario semanal generado con éxito.\n";
} else {
    echo "✓ El calendario ya tenía sesiones programadas (No se alteraron).\n";
}

// 4. Generar Reservaciones Aleatorias para los Socios
$sessions = ClassSession::where('date', '>=', Carbon::now()->format('Y-m-d'))->get();
$reservationsCount = 0;

foreach ($sessions as $session) {
    // Escoger 2 a 5 socios aleatorios
    $randomUsers = collect($users)->random(rand(2, 5));
    
    foreach ($randomUsers as $u) {
        // Reservar
        $res = Reservation::firstOrCreate([
            'user_id' => $u->id,
            'class_session_id' => $session->id,
        ], [
            'status' => 'confirmed'
        ]);
        if ($res->wasRecentlyCreated) $reservationsCount++;
    }
}

echo "✓ $reservationsCount nuevas reservaciones generadas.\n";
echo "\n🎉 ¡Inyección de datos COMPLETADA! Regresa a la app para ver el resultado.\n";
