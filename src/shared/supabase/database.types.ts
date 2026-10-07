
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "achievements": {
                  Row: {
                    "detail": string | null,"earned_at": string,"id": string,"key": string,"user_id": string
                  }
                  Insert: {
                    "detail"?: string | null,"earned_at"?: string,"id"?: string,"key": string,"user_id"?: string
                  }
                  Update: {
                    "detail"?: string | null,"earned_at"?: string,"id"?: string,"key"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"application_requirements": {
                  Row: {
                    "application_id": string,"done": boolean,"id": string,"position": number,"task_id": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "application_id": string,"done"?: boolean,"id"?: string,"position"?: number,"task_id"?: string | null,"title": string,"user_id"?: string
                  }
                  Update: {
                    "application_id"?: string,"done"?: boolean,"id"?: string,"position"?: number,"task_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_requirements_application_id_user_id_fkey"
      columns: ["application_id","user_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "application_requirements_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "created_at": string,"deadline_at": string | null,"deadline_tz": string | null,"description": string | null,"id": string,"kind": string,"link": string | null,"notes": string | null,"org": string | null,"results_expected": string | null,"status": string,"submitted_at": string | null,"target_days_before": number,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deadline_at"?: string | null,"deadline_tz"?: string | null,"description"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"notes"?: string | null,"org"?: string | null,"results_expected"?: string | null,"status"?: string,"submitted_at"?: string | null,"target_days_before"?: number,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"deadline_at"?: string | null,"deadline_tz"?: string | null,"description"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"notes"?: string | null,"org"?: string | null,"results_expected"?: string | null,"status"?: string,"submitted_at"?: string | null,"target_days_before"?: number,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bills": {
                  Row: {
                    "amount": number,"anchor_on": string,"category": string,"created_at": string,"every": string,"id": string,"item_id": string | null,"last_paid_at": string | null,"next_due": string,"status": string,"tag": Database["public"]['Enums']["money_tag"],"task_id": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "amount": number,"anchor_on": string,"category": string,"created_at"?: string,"every": string,"id"?: string,"item_id"?: string | null,"last_paid_at"?: string | null,"next_due": string,"status"?: string,"tag"?: Database["public"]['Enums']["money_tag"],"task_id"?: string | null,"title": string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"anchor_on"?: string,"category"?: string,"created_at"?: string,"every"?: string,"id"?: string,"item_id"?: string | null,"last_paid_at"?: string | null,"next_due"?: string,"status"?: string,"tag"?: Database["public"]['Enums']["money_tag"],"task_id"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "bills_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"buckets": {
                  Row: {
                    "balance": number,"name": Database["public"]['Enums']["bucket_name"],"target_pct": number | null,"user_id": string
                  }
                  Insert: {
                    "balance"?: number,"name": Database["public"]['Enums']["bucket_name"],"target_pct"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "balance"?: number,"name"?: Database["public"]['Enums']["bucket_name"],"target_pct"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"checkins": {
                  Row: {
                    "created_at": string,"day": string,"energy": number | null,"id": string,"mood": number | null,"note": string | null,"screen_minutes": number | null,"sleep_hours": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"day": string,"energy"?: number | null,"id"?: string,"mood"?: number | null,"note"?: string | null,"screen_minutes"?: number | null,"sleep_hours"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"energy"?: number | null,"id"?: string,"mood"?: number | null,"note"?: string | null,"screen_minutes"?: number | null,"sleep_hours"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"commitment_roles": {
                  Row: {
                    "commitment_id": string,"created_at": string,"ends_on": string | null,"id": string,"notes": string | null,"starts_on": string | null,"title": string,"user_id": string
                  }
                  Insert: {
                    "commitment_id": string,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"notes"?: string | null,"starts_on"?: string | null,"title": string,"user_id"?: string
                  }
                  Update: {
                    "commitment_id"?: string,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"notes"?: string | null,"starts_on"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commitment_roles_commitment_id_user_id_fkey"
      columns: ["commitment_id","user_id"]
isOneToOne: false
      referencedRelation: "commitments"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"commitments": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"extra_minutes_per_week": number,"id": string,"kind": string,"notes": string | null,"org": string | null,"priority": string,"starts_on": string | null,"status": string,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"extra_minutes_per_week"?: number,"id"?: string,"kind"?: string,"notes"?: string | null,"org"?: string | null,"priority"?: string,"starts_on"?: string | null,"status"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"extra_minutes_per_week"?: number,"id"?: string,"kind"?: string,"notes"?: string | null,"org"?: string | null,"priority"?: string,"starts_on"?: string | null,"status"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"course_assessments": {
                  Row: {
                    "course_id": string,"created_at": string,"done": boolean,"due_at": string | null,"event_id": string | null,"id": string,"kind": string,"score": string | null,"task_id": string | null,"title": string,"topics": (string)[],"user_id": string,"weight_pct": number | null
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"done"?: boolean,"due_at"?: string | null,"event_id"?: string | null,"id"?: string,"kind": string,"score"?: string | null,"task_id"?: string | null,"title": string,"topics"?: (string)[],"user_id"?: string,"weight_pct"?: number | null
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"done"?: boolean,"due_at"?: string | null,"event_id"?: string | null,"id"?: string,"kind"?: string,"score"?: string | null,"task_id"?: string | null,"title"?: string,"topics"?: (string)[],"user_id"?: string,"weight_pct"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_assessments_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "course_assessments_event_id_user_id_fkey"
      columns: ["event_id","user_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "course_assessments_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"course_topics": {
                  Row: {
                    "course_id": string,"id": string,"notes": string | null,"position": number,"title": string,"user_id": string,"week": number | null
                  }
                  Insert: {
                    "course_id": string,"id"?: string,"notes"?: string | null,"position"?: number,"title": string,"user_id"?: string,"week"?: number | null
                  }
                  Update: {
                    "course_id"?: string,"id"?: string,"notes"?: string | null,"position"?: number,"title"?: string,"user_id"?: string,"week"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_topics_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "code": string | null,"created_at": string,"description": string | null,"id": string,"lecturer": string | null,"semester": string | null,"semester_end": string | null,"semester_start": string | null,"skill_id": string,"status": string,"target_grade": string | null,"title": string,"units": number | null,"user_id": string
                  }
                  Insert: {
                    "code"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"lecturer"?: string | null,"semester"?: string | null,"semester_end"?: string | null,"semester_start"?: string | null,"skill_id": string,"status"?: string,"target_grade"?: string | null,"title": string,"units"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "code"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"lecturer"?: string | null,"semester"?: string | null,"semester_end"?: string | null,"semester_start"?: string | null,"skill_id"?: string,"status"?: string,"target_grade"?: string | null,"title"?: string,"units"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "courses_skill_id_user_id_fkey"
      columns: ["skill_id","user_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"day_closes": {
                  Row: {
                    "closed_at": string,"day": string,"id": string,"note": string | null,"summary": NonNullable<Json>,"user_id": string,"win": string | null
                  }
                  Insert: {
                    "closed_at"?: string,"day": string,"id"?: string,"note"?: string | null,"summary"?: NonNullable<Json>,"user_id"?: string,"win"?: string | null
                  }
                  Update: {
                    "closed_at"?: string,"day"?: string,"id"?: string,"note"?: string | null,"summary"?: NonNullable<Json>,"user_id"?: string,"win"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"debt_payments": {
                  Row: {
                    "amount": number,"at": string,"debt_id": string,"id": string,"transaction_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"at"?: string,"debt_id": string,"id"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"at"?: string,"debt_id"?: string,"id"?: string,"transaction_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_user_id_fkey"
      columns: ["debt_id","user_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "debt_payments_transaction_id_user_id_fkey"
      columns: ["transaction_id","user_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "amount": number,"closed_at": string | null,"created_at": string,"direction": string,"due_on": string | null,"id": string,"person": string,"person_id": string | null,"reason": string | null,"status": string,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"closed_at"?: string | null,"created_at"?: string,"direction": string,"due_on"?: string | null,"id"?: string,"person": string,"person_id"?: string | null,"reason"?: string | null,"status"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"closed_at"?: string | null,"created_at"?: string,"direction"?: string,"due_on"?: string | null,"id"?: string,"person"?: string,"person_id"?: string | null,"reason"?: string | null,"status"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debts_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "debts_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"decisions": {
                  Row: {
                    "created_at": string,"decided_on": string,"decision": string,"expected": string | null,"id": string,"outcome": string | null,"review_on": string | null,"reviewed_at": string | null,"task_id": string | null,"user_id": string,"verdict": string | null,"why": string | null
                  }
                  Insert: {
                    "created_at"?: string,"decided_on"?: string,"decision": string,"expected"?: string | null,"id"?: string,"outcome"?: string | null,"review_on"?: string | null,"reviewed_at"?: string | null,"task_id"?: string | null,"user_id"?: string,"verdict"?: string | null,"why"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"decided_on"?: string,"decision"?: string,"expected"?: string | null,"id"?: string,"outcome"?: string | null,"review_on"?: string | null,"reviewed_at"?: string | null,"task_id"?: string | null,"user_id"?: string,"verdict"?: string | null,"why"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"commitment_id": string | null,"created_at": string,"ends_at": string | null,"external_uid": string | null,"id": string,"important": boolean,"kind": string,"location": string | null,"notes": string | null,"person": string | null,"reminder_note": string | null,"source": string,"starts_at": string,"status": string,"title": string,"user_id": string,"yearly": boolean
                  }
                  Insert: {
                    "all_day"?: boolean,"commitment_id"?: string | null,"created_at"?: string,"ends_at"?: string | null,"external_uid"?: string | null,"id"?: string,"important"?: boolean,"kind"?: string,"location"?: string | null,"notes"?: string | null,"person"?: string | null,"reminder_note"?: string | null,"source"?: string,"starts_at": string,"status"?: string,"title": string,"user_id"?: string,"yearly"?: boolean
                  }
                  Update: {
                    "all_day"?: boolean,"commitment_id"?: string | null,"created_at"?: string,"ends_at"?: string | null,"external_uid"?: string | null,"id"?: string,"important"?: boolean,"kind"?: string,"location"?: string | null,"notes"?: string | null,"person"?: string | null,"reminder_note"?: string | null,"source"?: string,"starts_at"?: string,"status"?: string,"title"?: string,"user_id"?: string,"yearly"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_commitment_id_user_id_fkey"
      columns: ["commitment_id","user_id"]
isOneToOne: false
      referencedRelation: "commitments"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"experiments": {
                  Row: {
                    "change": string,"conclusion": string | null,"created_at": string,"ends_on": string,"id": string,"metric": string | null,"question": string | null,"result": string | null,"starts_on": string,"status": string,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "change": string,"conclusion"?: string | null,"created_at"?: string,"ends_on": string,"id"?: string,"metric"?: string | null,"question"?: string | null,"result"?: string | null,"starts_on": string,"status"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "change"?: string,"conclusion"?: string | null,"created_at"?: string,"ends_on"?: string,"id"?: string,"metric"?: string | null,"question"?: string | null,"result"?: string | null,"starts_on"?: string,"status"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "experiments_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"note": string | null,"user_id": string,"value": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: string,"note"?: string | null,"user_id"?: string,"value": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"note"?: string | null,"user_id"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "created_at": string,"id": string,"message": string,"page": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"message": string,"page"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"message"?: string,"page"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fun_activities": {
                  Row: {
                    "active": boolean,"company": string,"cost": number,"created_at": string,"energy": string,"id": string,"last_done_at": string | null,"minutes": number | null,"notes": string | null,"times_done": number,"title": string,"user_id": string
                  }
                  Insert: {
                    "active"?: boolean,"company"?: string,"cost"?: number,"created_at"?: string,"energy"?: string,"id"?: string,"last_done_at"?: string | null,"minutes"?: number | null,"notes"?: string | null,"times_done"?: number,"title": string,"user_id"?: string
                  }
                  Update: {
                    "active"?: boolean,"company"?: string,"cost"?: number,"created_at"?: string,"energy"?: string,"id"?: string,"last_done_at"?: string | null,"minutes"?: number | null,"notes"?: string | null,"times_done"?: number,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"identity_profiles": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"text": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"text": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invites": {
                  Row: {
                    "bound_by_claim": boolean,"code": string,"created_at": string,"created_by": string,"email": string | null,"expires_at": string,"id": string,"note": string | null,"revoked_at": string | null,"used_at": string | null,"used_by": string | null
                  }
                  Insert: {
                    "bound_by_claim"?: boolean,"code": string,"created_at"?: string,"created_by"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"note"?: string | null,"revoked_at"?: string | null,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "bound_by_claim"?: boolean,"code"?: string,"created_at"?: string,"created_by"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"note"?: string | null,"revoked_at"?: string | null,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"items": {
                  Row: {
                    "comfortable_amount": number | null,"created_at": string,"deadline": string | null,"done_at": string | null,"floor_amount": number | null,"id": string,"priority": number,"status": Database["public"]['Enums']["item_status"],"status_changed_at": string | null,"target": string | null,"tier": Database["public"]['Enums']["tier"],"title": string,"user_id": string
                  }
                  Insert: {
                    "comfortable_amount"?: number | null,"created_at"?: string,"deadline"?: string | null,"done_at"?: string | null,"floor_amount"?: number | null,"id"?: string,"priority"?: number,"status"?: Database["public"]['Enums']["item_status"],"status_changed_at"?: string | null,"target"?: string | null,"tier": Database["public"]['Enums']["tier"],"title": string,"user_id"?: string
                  }
                  Update: {
                    "comfortable_amount"?: number | null,"created_at"?: string,"deadline"?: string | null,"done_at"?: string | null,"floor_amount"?: number | null,"id"?: string,"priority"?: number,"status"?: Database["public"]['Enums']["item_status"],"status_changed_at"?: string | null,"target"?: string | null,"tier"?: Database["public"]['Enums']["tier"],"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"learning_sessions": {
                  Row: {
                    "at": string,"confidence": number | null,"count": number | null,"id": string,"minutes": number,"notes": string | null,"skill_id": string,"topic": string | null,"unit": string | null,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"confidence"?: number | null,"count"?: number | null,"id"?: string,"minutes": number,"notes"?: string | null,"skill_id": string,"topic"?: string | null,"unit"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"confidence"?: number | null,"count"?: number | null,"id"?: string,"minutes"?: number,"notes"?: string | null,"skill_id"?: string,"topic"?: string | null,"unit"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "learning_sessions_skill_id_user_id_fkey"
      columns: ["skill_id","user_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"life_values": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"user_id": string,"value": string,"why": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"user_id"?: string,"value": string,"why"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"user_id"?: string,"value"?: string,"why"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"list_items": {
                  Row: {
                    "created_at": string,"done": boolean,"done_at": string | null,"id": string,"list_id": string,"note": string | null,"position": number,"text": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"done"?: boolean,"done_at"?: string | null,"id"?: string,"list_id": string,"note"?: string | null,"position"?: number,"text": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"done"?: boolean,"done_at"?: string | null,"id"?: string,"list_id"?: string,"note"?: string | null,"position"?: number,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_items_list_id_user_id_fkey"
      columns: ["list_id","user_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"lists": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"show_progress": boolean,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"show_progress"?: boolean,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"show_progress"?: boolean,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meal_plans": {
                  Row: {
                    "created_at": string,"day": string,"id": string,"meal_id": string | null,"name": string,"recipe_id": string | null,"slot": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"day": string,"id"?: string,"meal_id"?: string | null,"name": string,"recipe_id"?: string | null,"slot": string,"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"id"?: string,"meal_id"?: string | null,"name"?: string,"recipe_id"?: string | null,"slot"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meal_plans_meal_id_user_id_fkey"
      columns: ["meal_id","user_id"]
isOneToOne: false
      referencedRelation: "meals"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "meal_plans_recipe_id_user_id_fkey"
      columns: ["recipe_id","user_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"meals": {
                  Row: {
                    "at": string,"id": string,"ingredients": NonNullable<Json>,"name": string,"notes": string | null,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"id"?: string,"ingredients"?: NonNullable<Json>,"name": string,"notes"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"id"?: string,"ingredients"?: NonNullable<Json>,"name"?: string,"notes"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"media": {
                  Row: {
                    "created_at": string,"creator": string | null,"finished_on": string | null,"id": string,"kind": string,"notes": string | null,"rating": number | null,"started_on": string | null,"status": string,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"creator"?: string | null,"finished_on"?: string | null,"id"?: string,"kind": string,"notes"?: string | null,"rating"?: number | null,"started_on"?: string | null,"status"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"creator"?: string | null,"finished_on"?: string | null,"id"?: string,"kind"?: string,"notes"?: string | null,"rating"?: number | null,"started_on"?: string | null,"status"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"memories": {
                  Row: {
                    "at": string,"category": string,"id": string,"source": string | null,"text": string,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"category": string,"id"?: string,"source"?: string | null,"text": string,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"category"?: string,"id"?: string,"source"?: string | null,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pantry_items": {
                  Row: {
                    "category": string,"id": string,"low_at": number | null,"name": string,"quantity": number,"unit": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "category"?: string,"id"?: string,"low_at"?: number | null,"name": string,"quantity"?: number,"unit": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "category"?: string,"id"?: string,"low_at"?: number | null,"name"?: string,"quantity"?: number,"unit"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"people": {
                  Row: {
                    "birthday": string | null,"close": boolean,"created_at": string,"id": string,"last_contact_at": string | null,"name": string,"notes": string | null,"reach_out_every_days": number | null,"relation": string,"topics": (string)[],"user_id": string,"who": string | null
                  }
                  Insert: {
                    "birthday"?: string | null,"close"?: boolean,"created_at"?: string,"id"?: string,"last_contact_at"?: string | null,"name": string,"notes"?: string | null,"reach_out_every_days"?: number | null,"relation"?: string,"topics"?: (string)[],"user_id"?: string,"who"?: string | null
                  }
                  Update: {
                    "birthday"?: string | null,"close"?: boolean,"created_at"?: string,"id"?: string,"last_contact_at"?: string | null,"name"?: string,"notes"?: string | null,"reach_out_every_days"?: number | null,"relation"?: string,"topics"?: (string)[],"user_id"?: string,"who"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"people_contacts": {
                  Row: {
                    "at": string,"how": string,"id": string,"note": string | null,"person_id": string,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"how"?: string,"id"?: string,"note"?: string | null,"person_id": string,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"how"?: string,"id"?: string,"note"?: string | null,"person_id"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_contacts_person_id_user_id_fkey"
      columns: ["person_id","user_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "people_contacts_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"pillars": {
                  Row: {
                    "hp": number,"level": number,"name": Database["public"]['Enums']["pillar"],"user_id": string,"xp": number
                  }
                  Insert: {
                    "hp"?: number,"level"?: number,"name": Database["public"]['Enums']["pillar"],"user_id"?: string,"xp"?: number
                  }
                  Update: {
                    "hp"?: number,"level"?: number,"name"?: Database["public"]['Enums']["pillar"],"user_id"?: string,"xp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"promises": {
                  Row: {
                    "created_at": string,"due_at": string | null,"id": string,"kept_at": string | null,"made_at": string,"notes": string | null,"person": string,"released_at": string | null,"renegotiations": number,"status": string,"task_id": string | null,"user_id": string,"what": string
                  }
                  Insert: {
                    "created_at"?: string,"due_at"?: string | null,"id"?: string,"kept_at"?: string | null,"made_at"?: string,"notes"?: string | null,"person": string,"released_at"?: string | null,"renegotiations"?: number,"status"?: string,"task_id"?: string | null,"user_id"?: string,"what": string
                  }
                  Update: {
                    "created_at"?: string,"due_at"?: string | null,"id"?: string,"kept_at"?: string | null,"made_at"?: string,"notes"?: string | null,"person"?: string,"released_at"?: string | null,"renegotiations"?: number,"status"?: string,"task_id"?: string | null,"user_id"?: string,"what"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promises_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"purchase_checks": {
                  Row: {
                    "decided_at": string,"id": string,"interest": string,"interest_changed_at": string | null,"item": string,"price": number,"reasons": NonNullable<Json>,"user_id": string,"verdict": Database["public"]['Enums']["purchase_verdict"]
                  }
                  Insert: {
                    "decided_at"?: string,"id"?: string,"interest"?: string,"interest_changed_at"?: string | null,"item": string,"price": number,"reasons"?: NonNullable<Json>,"user_id"?: string,"verdict": Database["public"]['Enums']["purchase_verdict"]
                  }
                  Update: {
                    "decided_at"?: string,"id"?: string,"interest"?: string,"interest_changed_at"?: string | null,"item"?: string,"price"?: number,"reasons"?: NonNullable<Json>,"user_id"?: string,"verdict"?: Database["public"]['Enums']["purchase_verdict"]
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipes": {
                  Row: {
                    "created_at": string,"id": string,"ingredients": NonNullable<Json>,"minutes": number | null,"name": string,"notes": string | null,"slots": (string)[],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"ingredients"?: NonNullable<Json>,"minutes"?: number | null,"name": string,"notes"?: string | null,"slots"?: (string)[],"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ingredients"?: NonNullable<Json>,"minutes"?: number | null,"name"?: string,"notes"?: string | null,"slots"?: (string)[],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "answers": NonNullable<Json>,"created_at": string,"ends_on": string,"id": string,"period": string,"starts_on": string,"summary": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"ends_on": string,"id"?: string,"period": string,"starts_on": string,"summary"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"ends_on"?: string,"id"?: string,"period"?: string,"starts_on"?: string,"summary"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"routines": {
                  Row: {
                    "created_at": string,"id": string,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"self_notes": {
                  Row: {
                    "created_at": string,"detail": string | null,"id": string,"kind": string,"since": string | null,"status": string,"title": string,"updated_at": string,"user_id": string,"working_on": string | null
                  }
                  Insert: {
                    "created_at"?: string,"detail"?: string | null,"id"?: string,"kind": string,"since"?: string | null,"status"?: string,"title": string,"updated_at"?: string,"user_id"?: string,"working_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"detail"?: string | null,"id"?: string,"kind"?: string,"since"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"working_on"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"user_id": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "key": string,"user_id"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"user_id"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"skills": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string | null,"name": string,"pillar": Database["public"]['Enums']["pillar"],"status": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"name": string,"pillar"?: Database["public"]['Enums']["pillar"],"status"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"name"?: string,"pillar"?: Database["public"]['Enums']["pillar"],"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skills_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"slips": {
                  Row: {
                    "accepted": boolean,"at": string,"id": string,"task_id": string,"tone_used": Database["public"]['Enums']["mode"] | null,"user_id": string,"why": string | null,"why_category": string | null
                  }
                  Insert: {
                    "accepted": boolean,"at"?: string,"id"?: string,"task_id": string,"tone_used"?: Database["public"]['Enums']["mode"] | null,"user_id"?: string,"why"?: string | null,"why_category"?: string | null
                  }
                  Update: {
                    "accepted"?: boolean,"at"?: string,"id"?: string,"task_id"?: string,"tone_used"?: Database["public"]['Enums']["mode"] | null,"user_id"?: string,"why"?: string | null,"why_category"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "slips_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"spending_caps": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"monthly_cap": number,"user_id": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: string,"monthly_cap": number,"user_id"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"monthly_cap"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"statuses": {
                  Row: {
                    "ended_at": string | null,"ends_at": string,"id": string,"kind": string,"leave_lead_minutes": number,"note": string | null,"started_at": string,"user_id": string
                  }
                  Insert: {
                    "ended_at"?: string | null,"ends_at": string,"id"?: string,"kind": string,"leave_lead_minutes"?: number,"note"?: string | null,"started_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "ended_at"?: string | null,"ends_at"?: string,"id"?: string,"kind"?: string,"leave_lead_minutes"?: number,"note"?: string | null,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"task_pillars": {
                  Row: {
                    "pillar": Database["public"]['Enums']["pillar"],"task_id": string,"user_id": string,"weight": number
                  }
                  Insert: {
                    "pillar": Database["public"]['Enums']["pillar"],"task_id": string,"user_id"?: string,"weight": number
                  }
                  Update: {
                    "pillar"?: Database["public"]['Enums']["pillar"],"task_id"?: string,"user_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_pillars_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "base_xp": number,"commitment_id": string | null,"course_id": string | null,"created_at": string,"done_at": string | null,"due_at": string | null,"duration_minutes": number | null,"fun_activity_id": string | null,"id": string,"is_non_negotiable": boolean,"item_id": string | null,"location": string | null,"must_from": string | null,"occurs_on": string | null,"recurrence": string | null,"reminder_note": string | null,"reminders": (string)[] | null,"routine_id": string | null,"routine_step": number | null,"series_id": string | null,"skill_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"topic": string | null,"user_id": string
                  }
                  Insert: {
                    "base_xp"?: number,"commitment_id"?: string | null,"course_id"?: string | null,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"fun_activity_id"?: string | null,"id"?: string,"is_non_negotiable"?: boolean,"item_id"?: string | null,"location"?: string | null,"must_from"?: string | null,"occurs_on"?: string | null,"recurrence"?: string | null,"reminder_note"?: string | null,"reminders"?: (string)[] | null,"routine_id"?: string | null,"routine_step"?: number | null,"series_id"?: string | null,"skill_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"topic"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "base_xp"?: number,"commitment_id"?: string | null,"course_id"?: string | null,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"fun_activity_id"?: string | null,"id"?: string,"is_non_negotiable"?: boolean,"item_id"?: string | null,"location"?: string | null,"must_from"?: string | null,"occurs_on"?: string | null,"recurrence"?: string | null,"reminder_note"?: string | null,"reminders"?: (string)[] | null,"routine_id"?: string | null,"routine_step"?: number | null,"series_id"?: string | null,"skill_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"topic"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_commitment_id_user_id_fkey"
      columns: ["commitment_id","user_id"]
isOneToOne: false
      referencedRelation: "commitments"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_course_id_user_id_fkey"
      columns: ["course_id","user_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_fun_activity_id_user_id_fkey"
      columns: ["fun_activity_id","user_id"]
isOneToOne: false
      referencedRelation: "fun_activities"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_routine_id_user_id_fkey"
      columns: ["routine_id","user_id"]
isOneToOne: false
      referencedRelation: "routines"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "tasks_skill_id_user_id_fkey"
      columns: ["skill_id","user_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"themes": {
                  Row: {
                    "created_at": string,"focus": (string)[],"id": string,"not_now": (string)[],"notes": string | null,"period": string,"starts_on": string,"title": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"focus"?: (string)[],"id"?: string,"not_now"?: (string)[],"notes"?: string | null,"period": string,"starts_on": string,"title": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"focus"?: (string)[],"id"?: string,"not_now"?: (string)[],"notes"?: string | null,"period"?: string,"starts_on"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"at": string,"category": string,"direction": Database["public"]['Enums']["money_direction"],"id": string,"item_id": string | null,"kind": string,"note": string | null,"spend_level": Database["public"]['Enums']["spend_level"] | null,"split_applied_at": string | null,"tag": Database["public"]['Enums']["money_tag"] | null,"user_id": string,"void_reason": string | null,"voided_at": string | null
                  }
                  Insert: {
                    "amount": number,"at"?: string,"category": string,"direction": Database["public"]['Enums']["money_direction"],"id"?: string,"item_id"?: string | null,"kind"?: string,"note"?: string | null,"spend_level"?: Database["public"]['Enums']["spend_level"] | null,"split_applied_at"?: string | null,"tag"?: Database["public"]['Enums']["money_tag"] | null,"user_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "amount"?: number,"at"?: string,"category"?: string,"direction"?: Database["public"]['Enums']["money_direction"],"id"?: string,"item_id"?: string | null,"kind"?: string,"note"?: string | null,"spend_level"?: Database["public"]['Enums']["spend_level"] | null,"split_applied_at"?: string | null,"tag"?: Database["public"]['Enums']["money_tag"] | null,"user_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"update_log": {
                  Row: {
                    "content": string | null,"id": string,"sent_at": string,"update_id": string,"user_id": string
                  }
                  Insert: {
                    "content"?: string | null,"id"?: string,"sent_at"?: string,"update_id": string,"user_id"?: string
                  }
                  Update: {
                    "content"?: string | null,"id"?: string,"sent_at"?: string,"update_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "update_log_update_id_user_id_fkey"
      columns: ["update_id","user_id"]
isOneToOne: false
      referencedRelation: "updates"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"updates": {
                  Row: {
                    "about": string,"active": boolean,"channel": string,"created_at": string,"format": string | null,"id": string,"last_sent_at": string | null,"recipient": string,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "about": string,"active"?: boolean,"channel"?: string,"created_at"?: string,"format"?: string | null,"id"?: string,"last_sent_at"?: string | null,"recipient": string,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "about"?: string,"active"?: boolean,"channel"?: string,"created_at"?: string,"format"?: string | null,"id"?: string,"last_sent_at"?: string | null,"recipient"?: string,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "updates_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"user_plans": {
                  Row: {
                    "chosen_at": string,"period": string,"plan": string,"student": boolean,"trial_ends_at": string | null,"user_id": string
                  }
                  Insert: {
                    "chosen_at"?: string,"period"?: string,"plan": string,"student"?: boolean,"trial_ends_at"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "chosen_at"?: string,"period"?: string,"plan"?: string,"student"?: boolean,"trial_ends_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workout_days": {
                  Row: {
                    "duration_minutes": number,"id": string,"name": string,"plan_id": string,"position": number,"series_id": string | null,"start_time": string | null,"user_id": string,"weekdays": string
                  }
                  Insert: {
                    "duration_minutes"?: number,"id"?: string,"name": string,"plan_id": string,"position"?: number,"series_id"?: string | null,"start_time"?: string | null,"user_id"?: string,"weekdays": string
                  }
                  Update: {
                    "duration_minutes"?: number,"id"?: string,"name"?: string,"plan_id"?: string,"position"?: number,"series_id"?: string | null,"start_time"?: string | null,"user_id"?: string,"weekdays"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_days_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "workout_plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"workout_entries": {
                  Row: {
                    "exercise": string,"id": string,"log_id": string,"position": number,"reps": number | null,"seconds": number | null,"sets": number | null,"user_id": string,"weight_kg": number | null
                  }
                  Insert: {
                    "exercise": string,"id"?: string,"log_id": string,"position"?: number,"reps"?: number | null,"seconds"?: number | null,"sets"?: number | null,"user_id"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "exercise"?: string,"id"?: string,"log_id"?: string,"position"?: number,"reps"?: number | null,"seconds"?: number | null,"sets"?: number | null,"user_id"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_entries_log_id_user_id_fkey"
      columns: ["log_id","user_id"]
isOneToOne: false
      referencedRelation: "workout_logs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"workout_exercises": {
                  Row: {
                    "day_id": string,"id": string,"name": string,"notes": string | null,"position": number,"reps": string | null,"seconds": number | null,"sets": number | null,"user_id": string,"weight_kg": number | null
                  }
                  Insert: {
                    "day_id": string,"id"?: string,"name": string,"notes"?: string | null,"position"?: number,"reps"?: string | null,"seconds"?: number | null,"sets"?: number | null,"user_id"?: string,"weight_kg"?: number | null
                  }
                  Update: {
                    "day_id"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"position"?: number,"reps"?: string | null,"seconds"?: number | null,"sets"?: number | null,"user_id"?: string,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_exercises_day_id_user_id_fkey"
      columns: ["day_id","user_id"]
isOneToOne: false
      referencedRelation: "workout_days"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"workout_logs": {
                  Row: {
                    "at": string,"day_id": string | null,"duration_minutes": number | null,"feel": number | null,"id": string,"notes": string | null,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"day_id"?: string | null,"duration_minutes"?: number | null,"feel"?: number | null,"id"?: string,"notes"?: string | null,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"day_id"?: string | null,"duration_minutes"?: number | null,"feel"?: number | null,"id"?: string,"notes"?: string | null,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_logs_day_id_user_id_fkey"
      columns: ["day_id","user_id"]
isOneToOne: false
      referencedRelation: "workout_days"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "workout_logs_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"workout_plans": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"xp_log": {
                  Row: {
                    "amount": number,"at": string,"id": string,"item_id": string | null,"learning_session_id": string | null,"note": string | null,"pillar": Database["public"]['Enums']["pillar"],"reason": Database["public"]['Enums']["xp_reason"],"reversed_at": string | null,"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"at"?: string,"id"?: string,"item_id"?: string | null,"learning_session_id"?: string | null,"note"?: string | null,"pillar": Database["public"]['Enums']["pillar"],"reason": Database["public"]['Enums']["xp_reason"],"reversed_at"?: string | null,"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"at"?: string,"id"?: string,"item_id"?: string | null,"learning_session_id"?: string | null,"note"?: string | null,"pillar"?: Database["public"]['Enums']["pillar"],"reason"?: Database["public"]['Enums']["xp_reason"],"reversed_at"?: string | null,"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "xp_log_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "xp_log_learning_session_id_user_id_fkey"
      columns: ["learning_session_id","user_id"]
isOneToOne: false
      referencedRelation: "learning_sessions"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "xp_log_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activate_identity":
{ Args: { "p_id": string }; Returns: boolean
                           },
"add_debt":
{ Args: { "p_amount": number,"p_at": string,"p_direction": string,"p_due_on": string,"p_money_moved": boolean,"p_person": string,"p_person_id": string,"p_reason": string }; Returns: string
                           },
"adjust_pantry":
{ Args: { "p_changes": Json }; Returns: Json
                           },
"apply_split":
{ Args: { "p_amounts": Json,"p_transaction_id": string }; Returns: string
                           },
"award_xp":
{ Args: { "p_entries": Json }; Returns: number
                           },
"choose_plan":
{ Args: { "p_period"?: string,"p_plan": string,"p_student"?: boolean }; Returns: string
                           },
"claim_invite":
{ Args: { "p_code": string,"p_email": string }; Returns: string
                           },
"close_day":
{ Args: { "p_day": string,"p_note": string,"p_summary": Json,"p_win": string,"p_xp": Json }; Returns: Json
                           },
"complete_item":
{ Args: { "p_done_at": string,"p_entries": Json,"p_item_id": string }; Returns: Json
                           },
"complete_task":
{ Args: { "p_done_at": string,"p_entries": Json,"p_task_id": string }; Returns: Json
                           },
"cook_meal":
{ Args: { "p_at": string,"p_ingredients": Json,"p_name": string,"p_notes": string }; Returns: Json
                           },
"create_invite":
{ Args: { "p_email"?: string,"p_note"?: string }; Returns: {
              "code": string,"invites_left": number
            }[]
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"export_all":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"hook_before_user_created":
{ Args: { "event": Json }; Returns: Json
                           },
"invites_left":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_plan":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"pay_bill":
{ Args: { "p_amount": number,"p_at": string,"p_bill_id": string,"p_for_due": string,"p_next_due": string,"p_xp": Json }; Returns: Json
                           },
"rate_hit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"record_debt_payment":
{ Args: { "p_amount": number,"p_at": string,"p_debt_id": string,"p_money_moved": boolean }; Returns: Json
                           },
"record_learning":
{ Args: { "p_at": string,"p_confidence": number,"p_count": number,"p_minutes": number,"p_notes": string,"p_skill_id": string,"p_topic": string,"p_unit": string,"p_xp": Json }; Returns: string
                           },
"record_slip":
{ Args: { "p_accepted": boolean,"p_task_id": string,"p_tone": Database["public"]['Enums']["mode"],"p_why": string,"p_why_category": string }; Returns: string
                           },
"record_transaction":
{ Args: { "p_amount": number,"p_at": string,"p_category": string,"p_direction": Database["public"]['Enums']["money_direction"],"p_item_id": string,"p_note": string,"p_spend_level": Database["public"]['Enums']["spend_level"],"p_tag": Database["public"]['Enums']["money_tag"],"p_xp": Json }; Returns: string
                           },
"record_update_sent":
{ Args: { "p_at": string,"p_content": string,"p_update_id": string }; Returns: string
                           },
"record_workout":
{ Args: { "p_at": string,"p_day_id": string,"p_duration": number,"p_entries": Json,"p_feel": number,"p_notes": string,"p_task_id": string }; Returns: string
                           },
"reverse_xp":
{ Args: { "p_ids": (string)[],"p_note": string }; Returns: number
                           },
"save_identity":
{ Args: { "p_activate": boolean,"p_name": string,"p_text": string }; Returns: string
                           },
"save_workout_plan":
{ Args: { "p_days": Json,"p_name": string }; Returns: string
                           },
"set_task_weights":
{ Args: { "p_task_id": string,"p_weights": Json }; Returns: undefined
                           },
"signup_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"spawn_occurrence":
{ Args: { "p_due_at": string,"p_occurs_on": string,"p_series_id": string }; Returns: string
                           },
"touch_activity":
{ Args: { "p_via": string }; Returns: undefined
                           },
"undo_learning":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"undo_task":
{ Args: { "p_cancel": boolean,"p_task_id": string }; Returns: Json
                           },
"void_transaction":
{ Args: { "p_id": string,"p_reason": string,"p_xp_reversal": Json }; Returns: string
                           }
          }
          Enums: {
            "bucket_name": "needs"|"buffer"|"savings"|"wants"|"flexible","item_status": "active"|"done"|"paused"|"dropped","mode": "curious"|"strict"|"soft"|"strictest"|"softest","money_direction": "in"|"out","money_tag": "need"|"want"|"unsure","pillar": "spiritual"|"mental"|"physical"|"financial"|"emotional"|"social"|"character"|"skills"|"creativity"|"relationships"|"academic","purchase_verdict": "yes"|"wait_24h"|"no","spend_level": "floor"|"comfortable","task_status": "pending"|"done"|"skipped"|"cancelled","tier": "need"|"want"|"goal"|"wish"|"dream","xp_reason": "completion"|"late_completion"|"ignored_need"|"goal_completion"|"wish_fulfilled"|"dream_milestone"|"transaction_logged"|"learning"|"broken_promise"|"undo"|"day_closed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "bucket_name": ["needs", "buffer", "savings", "wants", "flexible"],"item_status": ["active", "done", "paused", "dropped"],"mode": ["curious", "strict", "soft", "strictest", "softest"],"money_direction": ["in", "out"],"money_tag": ["need", "want", "unsure"],"pillar": ["spiritual", "mental", "physical", "financial", "emotional", "social", "character", "skills", "creativity", "relationships", "academic"],"purchase_verdict": ["yes", "wait_24h", "no"],"spend_level": ["floor", "comfortable"],"task_status": ["pending", "done", "skipped", "cancelled"],"tier": ["need", "want", "goal", "wish", "dream"],"xp_reason": ["completion", "late_completion", "ignored_need", "goal_completion", "wish_fulfilled", "dream_milestone", "transaction_logged", "learning", "broken_promise", "undo", "day_closed"]
          }
        }
} as const
