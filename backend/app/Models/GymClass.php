<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GymClass extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'color',
        'default_capacity',
        'default_duration_minutes',
        // Legacy fields
        'trainer', 'start_time', 'end_time', 'days_of_week', 'capacity'
    ];
    
    protected $casts = [
        'days_of_week' => 'array'
    ];

    public function sessions()
    {
        return $this->hasMany(ClassSession::class);
    }
}
