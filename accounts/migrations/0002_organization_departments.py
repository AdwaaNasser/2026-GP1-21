from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=[
                        """
                        CREATE TABLE organization (
                            organizationid integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                            organizationname varchar(255) NOT NULL UNIQUE
                        )
                        """,
                        """
                        INSERT INTO organization (organizationname)
                        VALUES ('Bayyinah')
                        """,
                        """
                        ALTER TABLE department
                        ADD COLUMN organizationid integer
                        """,
                        """
                        UPDATE department
                        SET organizationid = (
                            SELECT organizationid
                            FROM organization
                            WHERE organizationname = 'Bayyinah'
                        )
                        """,
                        """
                        ALTER TABLE department
                        ALTER COLUMN organizationid SET NOT NULL
                        """,
                        """
                        ALTER TABLE department
                        ADD CONSTRAINT department_organizationid_fk
                        FOREIGN KEY (organizationid)
                        REFERENCES organization (organizationid)
                        """,
                    ],
                    reverse_sql=[
                        """
                        ALTER TABLE department
                        DROP CONSTRAINT department_organizationid_fk
                        """,
                        """
                        ALTER TABLE department
                        DROP COLUMN organizationid
                        """,
                        "DROP TABLE organization",
                    ],
                ),
            ],
            state_operations=[
                migrations.RenameModel(
                    old_name='Organization',
                    new_name='Department',
                ),
                migrations.CreateModel(
                    name='Organization',
                    fields=[
                        (
                            'id',
                            models.AutoField(
                                db_column='organizationid',
                                primary_key=True,
                                serialize=False,
                            ),
                        ),
                        (
                            'name',
                            models.CharField(
                                db_column='organizationname',
                                max_length=255,
                                unique=True,
                            ),
                        ),
                    ],
                    options={
                        'db_table': 'organization',
                    },
                ),
                migrations.AddField(
                    model_name='department',
                    name='organization',
                    field=models.ForeignKey(
                        db_column='organizationid',
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='departments',
                        to='accounts.organization',
                    ),
                ),
                migrations.RenameField(
                    model_name='systemuser',
                    old_name='organization',
                    new_name='department',
                ),
                migrations.AlterField(
                    model_name='systemuser',
                    name='password',
                    field=models.CharField(
                        db_column='passwordhash',
                        max_length=255,
                        verbose_name='password',
                    ),
                ),
            ],
        ),
    ]
