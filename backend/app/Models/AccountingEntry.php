<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountingEntry extends Model
{
    protected $fillable = [
        'type', 'concept_id', 'amount', 'entry_type',
        'product_id', 'product_qty', 'notes', 'entry_date', 'created_by',
    ];

    protected $casts = [
        'amount'      => 'decimal:2',
        'entry_date'  => 'date:Y-m-d',
        'product_qty' => 'integer',
    ];

    public function concept()
    {
        return $this->belongsTo(AccountingConcept::class, 'concept_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
