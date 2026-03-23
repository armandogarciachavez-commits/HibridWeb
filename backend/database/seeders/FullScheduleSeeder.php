<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use App\Models\GymClass;

class FullScheduleSeeder extends Seeder
{
    public function run()
    {
        // Limpiamos las tablas (cuidado en producción, pero aquí queremos el calendario maestro)
        DB::table('reservations')->truncate();
        DB::table('gym_classes')->truncate();

        $schedule = [
            // LUNES (1)
            ['day' => 1, 'time' => '06:00:00', 'trainer' => 'ALEX', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '07:00:00', 'trainer' => 'ITHZEL', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '08:00:00', 'trainer' => 'VANESSA', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '18:00:00', 'trainer' => 'BARBARA', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '19:00:00', 'trainer' => 'ITHZEL', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '20:00:00', 'trainer' => 'ITHZEL', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 1, 'time' => '21:00:00', 'trainer' => 'BARBARA', 'name' => 'LEG HYBRID STRENGTH'],

            // MARTES (2)
            ['day' => 2, 'time' => '06:00:00', 'trainer' => 'ESTEBAN', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '07:00:00', 'trainer' => 'ALEX', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '08:00:00', 'trainer' => 'ALEX', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '18:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '19:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '20:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID UPPER BURN'],
            ['day' => 2, 'time' => '21:00:00', 'trainer' => 'HIBRIDO', 'name' => 'HYBRID UPPER BURN'],

            // MIÉRCOLES (3)
            ['day' => 3, 'time' => '06:00:00', 'trainer' => 'ALEX', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '07:00:00', 'trainer' => 'ITHZEL', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '08:00:00', 'trainer' => 'VANESSA', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '18:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '19:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '20:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID TEST'],
            ['day' => 3, 'time' => '21:00:00', 'trainer' => 'HIBRIDO', 'name' => 'HYBRID TEST'],

            // JUEVES (4)
            ['day' => 4, 'time' => '06:00:00', 'trainer' => 'ALEX', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '07:00:00', 'trainer' => 'ALAN', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '08:00:00', 'trainer' => 'VANESSA', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '18:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '19:00:00', 'trainer' => 'GIL', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '20:00:00', 'trainer' => 'ADRIANA', 'name' => 'HYBRID ATHLETE'],
            ['day' => 4, 'time' => '21:00:00', 'trainer' => 'HIBRIDO', 'name' => 'HYBRID ATHLETE'],

            // VIERNES (5)
            ['day' => 5, 'time' => '06:00:00', 'trainer' => 'ALAN', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '07:00:00', 'trainer' => 'ALAN', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '08:00:00', 'trainer' => 'ADRIANA', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '18:00:00', 'trainer' => 'GIL', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '19:00:00', 'trainer' => 'GIL', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '20:00:00', 'trainer' => 'ADRIANA', 'name' => 'LEG HYBRID STRENGTH'],
            ['day' => 5, 'time' => '21:00:00', 'trainer' => 'BARBARA', 'name' => 'LEG HYBRID STRENGTH'],

            // SÁBADO (6)
            ['day' => 6, 'time' => '06:00:00', 'trainer' => 'YOGA', 'name' => 'YOGA'],
        ];

        foreach ($schedule as $slot) {
            $endTime = (int)substr($slot['time'], 0, 2) + 1;
            $endTimeStr = str_pad($endTime, 2, '0', STR_PAD_LEFT) . ':00:00';

            GymClass::create([
                'name' => $slot['name'],
                'trainer' => $slot['trainer'],
                'start_time' => $slot['time'],
                'end_time' => $endTimeStr,
                'days_of_week' => json_encode([$slot['day']]),
                'capacity' => 15
            ]);
        }
    }
}
