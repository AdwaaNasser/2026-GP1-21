import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0002_organization_departments'),
    ]

    operations = [
        migrations.CreateModel(
            name='CSVImportBatch',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'created_by',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to='accounts.systemuser',
                    ),
                ),
                (
                    'organization',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to='accounts.organization',
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name='CSVImportRecord',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'status',
                    models.CharField(
                        choices=[
                            ('imported', 'Imported'),
                            ('invited', 'Invited'),
                        ],
                        default='imported',
                        max_length=20,
                    ),
                ),
                ('error', models.TextField(blank=True)),
                (
                    'batch',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='records',
                        to='accounts.csvimportbatch',
                    ),
                ),
                (
                    'employee',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to='accounts.systemuser',
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name='csvimportrecord',
            constraint=models.UniqueConstraint(
                fields=('batch', 'employee'),
                name='unique_employee_per_csv_import',
            ),
        ),
    ]
