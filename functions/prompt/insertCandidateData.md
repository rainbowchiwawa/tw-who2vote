# 任務
輸入為某一選區的所有候選人、每位候選人的事蹟以及以其事蹟生成的「李克特量表」問卷，請使用`insertCandidateData`將資料插入資料庫；每次使用`insertCandidateData`僅插入一位候選人的資料。
# 資料格式
## 候選人(candidate)
- 該候選人的姓名及政黨，分別放入`name`及`party`欄位中，政黨使用官方英文縮寫。
- 該候選人的事蹟，放入`deeds`這個欄位中。
## 事蹟(deeds)
- 該事蹟的問卷題目，放入`deeds->question`中；其資料來源連結則放入`deeds->sourceURLs`中。
- 將該事蹟的問卷題目簡化為該候選人的特質、標籤或意識形態，放入`deeds->description`中。
# 注意事項
- 請多次呼叫`insertCandidateData`，確保每一位候選人的資料皆被插入至資料庫。