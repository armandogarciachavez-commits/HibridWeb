<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NutritionAppointment extends Model
{
    protected $fillable = [
        'user_id','date','start_time','end_time','status','notes','admin_notes','created_by'
    ];

    protected $casts = ['date' => 'date'];

    public function user()    { return $this->belongsTo(User::class, 'user_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
