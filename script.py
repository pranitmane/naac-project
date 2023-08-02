import tabula
import sys
import argparse

def process_pdf(input_path, output_path):
    try:
        # Read the PDF data into a DataFrame
        df = tabula.read_pdf(input_path, pages="all")

        # Convert the DataFrame to CSV and save it
        tabula.convert_into(input_path=input_path, output_path=output_path, output_format="csv", pages="all", stream=True)

        print("PDF data successfully processed")
    except Exception as e:
        # Print the error message to standard error stream
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process a PDF file and save as CSV.")
    parser.add_argument("input_file", help="Path to the input PDF file.")
    parser.add_argument("--output_file", default="test.csv", help="Path to the output CSV file. Default: test.csv")
    
    args = parser.parse_args()

    # Call the function with the provided arguments
    process_pdf(args.input_file, args.output_file)
