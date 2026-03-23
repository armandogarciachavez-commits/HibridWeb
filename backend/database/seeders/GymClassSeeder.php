<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\GymClass;

class GymClassSeeder extends Seeder
{
    public function run()
    {
        GymClass::create([
            'name' => 'Hybrid Strength', 
            'trainer' => 'Alex', 
            'start_time' => '06:00:00', 
            'end_time' => '07:00:00', 
            'capacity' => 15
        ]);

        GymClass::create([
            'name' => 'Hybrid Cardio Burn', 
            'trainer' => 'Sofia', 
            'start_time' => '07:00:00', 
            'end_time' => '08:00:00', 
            'capacity' => 15
        ]);

        GymClass::create([
            'name' => 'Hybrid Athlete Performance', 
            'trainer' => 'Carlos', 
            'start_time' => '08:00:00', 
            'end_time' => '09:00:00', 
            'capacity' => 15
        ]);

        GymClass::create([
            'name' => 'Hybrid Strength (Tarde)', 
            'trainer' => 'Alex', 
            'start_time' => '18:00:00', 
            'end_time' => '19:00:00', 
            'capacity' => 15
        ]);
    }
}
