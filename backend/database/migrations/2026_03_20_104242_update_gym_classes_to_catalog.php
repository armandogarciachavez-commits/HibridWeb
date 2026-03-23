<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gym_classes', function (Blueprint $table) {
            $table->string('description')->nullable();
            $table->string('color')->default('#4CAF50');
            $table->integer('default_capacity')->default(15);
            $table->integer('default_duration_minutes')->default(60);
            
            // To ensure compatibility across SQLite, we retain string values and 
            // set defaults instead of hard-dropping them immediately, or let them be empty
            // The old 'start_time', 'end_time', 'days_of_week', and 'trainer'
            // are considered deprecated but kept to prevent SQLite column drop issues if doctrine/dbal isn't installed.
        });
    }

    public function down(): void
    {
        Schema::table('gym_classes', function (Blueprint $table) {
            $table->dropColumn(['description', 'color', 'default_capacity', 'default_duration_minutes']);
        });
    }
};
