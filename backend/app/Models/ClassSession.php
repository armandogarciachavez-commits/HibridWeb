<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClassSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'gym_class_id',
        'instructor',
        'date',
        'start_time',
        'end_time',
        'capacity',
        'status',
    ];

    protected $casts = [
        'date' => 'date',
    ];

    public function gymClass()
    {
        return $this->belongsTo(GymClass::class, 'gym_class_id');
    }

    public function reservations()
    {
        return $this->hasMany(Reservation::class);
    }
}
