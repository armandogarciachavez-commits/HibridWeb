<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Make legacy gym_classes columns nullable so catalog entries
     * (which only have name/description/color/default_capacity/default_duration_minutes)
     * can be created without supplying the old scheduling fields.
     */
    public function up(): void
    {
        Schema::table('gym_classes', function (Blueprint $table) {
            $table->string('trainer')->nullable()->default(null)->change();
            $table->time('start_time')->nullable()->default(null)->change();
            $table->time('end_time')->nullable()->default(null)->change();
        });
    }

    public function down(): void
    {
        Schema::table('gym_classes', function (Blueprint $table) {
            $table->string('trainer')->nullable(false)->change();
            $table->time('start_time')->nullable(false)->change();
            $table->time('end_time')->nullable(false)->change();
        });
    }
};
