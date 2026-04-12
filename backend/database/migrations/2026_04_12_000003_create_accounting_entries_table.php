<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_entries', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['ingreso', 'egreso']);
            $table->foreignId('concept_id')->constrained('accounting_concepts')->restrictOnDelete();
            $table->decimal('amount', 10, 2);
            $table->enum('entry_type', ['manual', 'product_sale'])->default('manual');
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->unsignedInteger('product_qty')->nullable();
            $table->text('notes')->nullable();
            $table->date('entry_date');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['type', 'entry_date']);
            $table->index('entry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_entries');
    }
};
