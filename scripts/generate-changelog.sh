#!/bin/bash

# Generate changelog from git history
# Usage: ./scripts/generate-changelog.sh [output_file]

OUTPUT_FILE="${1:-changelog.txt}"

echo "SafeTube Development Changelog" > "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "==========================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Use process substitution to preserve variable scope and ensure all commits are included
last_date=""
# Add an extra echo to ensure the last line is processed
while IFS='|' read -r date message || [ -n "$date" ]; do
    # Skip if date is empty
    if [ -z "$date" ]; then
        continue
    fi
    # Check if this is a new date
    if [ "$date" != "$last_date" ]; then
        echo "" >> "$OUTPUT_FILE"
        echo "## $date" >> "$OUTPUT_FILE"
        echo "---" >> "$OUTPUT_FILE"
        last_date="$date"
    fi
    # Clean up the message and add it
    clean_message=$(echo "$message" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    echo "- $clean_message" >> "$OUTPUT_FILE"
done < <( (git log --date=short --pretty=format:"%ad|%s" --reverse; echo) )

echo "" >> "$OUTPUT_FILE"
echo "==========================================" >> "$OUTPUT_FILE"
echo "End of changelog" >> "$OUTPUT_FILE"

echo "Changelog generated: $OUTPUT_FILE"
echo "You can now use this to update development-tracking.md with correct dates" 