<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // For development safety, we drop and recreate the table structure 
        // to avoid complex SQLite constraint drops on the old table.
        Schema::dropIfExists('reservations');

        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('class_session_id')->constrained('class_sessions')->cascadeOnDelete();
            $table->string('status')->default('confirmed');
            $table->timestamps();

            $table->unique(['user_id', 'class_session_id'], 'user_session_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservations');
    }
};
