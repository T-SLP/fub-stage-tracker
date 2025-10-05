#!/usr/bin/env python3
"""
Campaign Qualified Leads Report - CSV Based

Generates a report from ReadyMode export CSV files showing:
1. Total contacts per campaign
2. Qualified leads (ACQ - Qualified Lead) - count and percentage
3. Price motivated leads (ACQ - Price Motivated) - count and percentage
4. Listed on market leads (ACQ - Listed on Market) - count and percentage
"""

import os
import csv
import glob
import re
from datetime import datetime
from typing import Dict, List
from collections import defaultdict
import statistics

# Directory containing the CSV export files
CSV_DIR = r"G:\My Drive\SLP Operations\CC Finished Campaign Reports"


def extract_campaign_id(filename: str) -> str:
    """Extract campaign ID from filename"""
    # Match patterns like GA25_01, WI25_02, MI25_03, etc.
    match = re.search(r'([A-Z]{2}\d{2}_\d{2})', filename)
    if match:
        return match.group(1)
    return None


def process_csv_file(filepath: str) -> Dict:
    """Process a single CSV file and return campaign statistics"""
    stats = {
        'total': 0,
        'qualified': 0,
        'price_motivated': 0,
        'listed_on_market': 0
    }

    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                stats['total'] += 1
                status = row.get('Status', '').strip()

                if status == 'ACQ - Qualified Lead':
                    stats['qualified'] += 1
                elif status == 'ACQ - Price Motivated':
                    stats['price_motivated'] += 1
                elif status == 'ACQ - Listed on Market':
                    stats['listed_on_market'] += 1

    except Exception as e:
        print(f"Warning: Error processing {filepath}: {e}")

    return stats


def get_campaign_stats() -> List[Dict]:
    """Get statistics for all campaigns from CSV files"""
    campaign_data = defaultdict(lambda: {
        'total': 0,
        'qualified': 0,
        'price_motivated': 0,
        'listed_on_market': 0
    })

    # Find all CSV files
    csv_files = glob.glob(os.path.join(CSV_DIR, "*.csv"))

    if not csv_files:
        print(f"!! No CSV files found in {CSV_DIR}")
        return []

    print(f">> Found {len(csv_files)} CSV files to process")

    # Process each file
    for filepath in csv_files:
        filename = os.path.basename(filepath)
        campaign_id = extract_campaign_id(filename)

        if not campaign_id:
            print(f"   Skipping {filename} - cannot extract campaign ID")
            continue

        # Skip "-revised" files if we already have the original
        if '-revised' in filename.lower():
            # Check if non-revised version exists
            non_revised = filename.replace('-revised', '')
            if os.path.exists(os.path.join(CSV_DIR, non_revised)):
                print(f"   Skipping {filename} - using non-revised version")
                continue

        stats = process_csv_file(filepath)

        # If we already have data for this campaign (from a non-revised file), skip
        if campaign_data[campaign_id]['total'] > 0:
            print(f"   Skipping {filename} - already have data for {campaign_id}")
            continue

        campaign_data[campaign_id] = stats
        print(f"   Processed {campaign_id}: {stats['total']} contacts")

    # Convert to list with percentages
    results = []
    for campaign_id, stats in campaign_data.items():
        total = stats['total']
        if total == 0:
            continue

        results.append({
            'campaign_id': campaign_id,
            'total_leads': total,
            'qualified_leads': stats['qualified'],
            'qualified_pct': round(100.0 * stats['qualified'] / total, 2) if total > 0 else 0,
            'price_motivated': stats['price_motivated'],
            'price_motivated_pct': round(100.0 * stats['price_motivated'] / total, 2) if total > 0 else 0,
            'listed_on_market': stats['listed_on_market'],
            'listed_on_market_pct': round(100.0 * stats['listed_on_market'] / total, 2) if total > 0 else 0
        })

    # Sort by total leads descending
    results.sort(key=lambda x: x['total_leads'], reverse=True)

    return results


def print_report(stats: List[Dict]):
    """Print formatted report to console"""

    print("\n" + "=" * 120)
    print("CAMPAIGN QUALIFIED LEADS REPORT - From ReadyMode CSV Exports")
    print("=" * 120)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 120)
    print()

    if not stats:
        print("!! No data found. No CSV files processed.")
        return

    # Print header
    header = (
        f"{'Campaign ID':<30} | "
        f"{'Total':>8} | "
        f"{'Qualified':>10} | "
        f"{'Qual %':>8} | "
        f"{'Price Mot':>10} | "
        f"{'PM %':>8} | "
        f"{'Listed':>10} | "
        f"{'List %':>8}"
    )
    print(header)
    print("-" * 120)

    # Print data rows
    total_leads_sum = 0
    qualified_sum = 0
    price_motivated_sum = 0
    listed_sum = 0

    for stat in stats:
        campaign_id = stat['campaign_id'][:30]  # Truncate long campaign IDs
        total = stat['total_leads']
        qualified = stat['qualified_leads']
        qualified_pct = stat['qualified_pct']
        price_motivated = stat['price_motivated']
        price_motivated_pct = stat['price_motivated_pct']
        listed = stat['listed_on_market']
        listed_pct = stat['listed_on_market_pct']

        # Accumulate totals
        total_leads_sum += total
        qualified_sum += qualified
        price_motivated_sum += price_motivated
        listed_sum += listed

        row = (
            f"{campaign_id:<30} | "
            f"{total:>8,} | "
            f"{qualified:>10,} | "
            f"{qualified_pct:>7.2f}% | "
            f"{price_motivated:>10,} | "
            f"{price_motivated_pct:>7.2f}% | "
            f"{listed:>10,} | "
            f"{listed_pct:>7.2f}%"
        )
        print(row)

    # Print summary
    print("-" * 120)
    overall_qualified_pct = (qualified_sum / total_leads_sum * 100) if total_leads_sum > 0 else 0
    overall_price_motivated_pct = (price_motivated_sum / total_leads_sum * 100) if total_leads_sum > 0 else 0
    overall_listed_pct = (listed_sum / total_leads_sum * 100) if total_leads_sum > 0 else 0

    summary = (
        f"{'TOTAL':<30} | "
        f"{total_leads_sum:>8,} | "
        f"{qualified_sum:>10,} | "
        f"{overall_qualified_pct:>7.2f}% | "
        f"{price_motivated_sum:>10,} | "
        f"{overall_price_motivated_pct:>7.2f}% | "
        f"{listed_sum:>10,} | "
        f"{overall_listed_pct:>7.2f}%"
    )
    print(summary)

    # Calculate averages
    qualified_pcts = [s['qualified_pct'] for s in stats]
    price_motivated_pcts = [s['price_motivated_pct'] for s in stats]
    listed_pcts = [s['listed_on_market_pct'] for s in stats]

    avg_qualified_pct = statistics.mean(qualified_pcts) if qualified_pcts else 0
    avg_price_motivated_pct = statistics.mean(price_motivated_pcts) if price_motivated_pcts else 0
    avg_listed_pct = statistics.mean(listed_pcts) if listed_pcts else 0

    average_row = (
        f"{'AVERAGE':<30} | "
        f"{' ':>8} | "
        f"{' ':>10} | "
        f"{avg_qualified_pct:>7.2f}% | "
        f"{' ':>10} | "
        f"{avg_price_motivated_pct:>7.2f}% | "
        f"{' ':>10} | "
        f"{avg_listed_pct:>7.2f}%"
    )
    print(average_row)

    # Calculate standard deviations
    std_qualified_pct = statistics.stdev(qualified_pcts) if len(qualified_pcts) > 1 else 0
    std_price_motivated_pct = statistics.stdev(price_motivated_pcts) if len(price_motivated_pcts) > 1 else 0
    std_listed_pct = statistics.stdev(listed_pcts) if len(listed_pcts) > 1 else 0

    stdev_row = (
        f"{'STANDARD DEVIATION':<30} | "
        f"{' ':>8} | "
        f"{' ':>10} | "
        f"{std_qualified_pct:>7.2f}% | "
        f"{' ':>10} | "
        f"{std_price_motivated_pct:>7.2f}% | "
        f"{' ':>10} | "
        f"{std_listed_pct:>7.2f}%"
    )
    print(stdev_row)
    print("=" * 120)

    print(f"\n>> Report complete: {len(stats)} campaigns analyzed")
    print(f">> Total contacts: {total_leads_sum:,}")
    print(f">> Qualified leads: {qualified_sum:,} ({overall_qualified_pct:.2f}%)")
    print(f">> Price motivated: {price_motivated_sum:,} ({overall_price_motivated_pct:.2f}%)")
    print(f">> Listed on market: {listed_sum:,} ({overall_listed_pct:.2f}%)")
    print()


def main():
    """Main execution"""
    print("\n>> Starting Campaign Qualified Leads Report (CSV-based)...")
    print(f">> Reading CSV files from: {CSV_DIR}")

    # Get campaign statistics from CSV files
    stats = get_campaign_stats()

    # Print report
    print_report(stats)


if __name__ == "__main__":
    main()
